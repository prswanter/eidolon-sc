"""Asking an outside service again, once, when a request a turn waits on fails in passing.

A turn's query embedding and its reranking hold up her reply, so each request is given
only a few seconds (`TURN_TIMEOUT`), and one that times out, cannot connect or is
answered 429 or 5xx is made again at once (`retry_once`): a hiccup goes unnoticed, a
service that is down costs the turn a few seconds, not half a minute. One refused
otherwise (another 4xx) or answered with what cannot be read would only fail again.

Each attempt is a service call of its own on the dashboard: whoever times the request
(`activity.timed`) is told of a failed one (`on_retry`) as it is made again.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import TypeVar

import httpx

log = logging.getLogger(__name__)

TURN_TIMEOUT = 3.0
"""Seconds a request a turn waits on, a query embedded or candidates reranked, is given.
Of those in production (2026-10-14), 99 in 100 query embeddings took 0.82 s or less and
99 in 100 rerankings 0.83 s or less."""

T = TypeVar("T")


class ServiceError(RuntimeError):
    """A request to an outside service failed; `transient` if it failed in passing (it
    timed out, could not connect, or was answered 429 or 5xx), so asking again may not."""

    def __init__(self, message: str, *, transient: bool = False) -> None:
        super().__init__(message)
        self.transient = transient


def transient_status(status: int) -> bool:
    """Whether a service answering `status` may answer otherwise if asked again."""
    return status == 429 or status >= 500


@asynccontextmanager
async def answered(
    service: str, timeout: float | None, error: type[ServiceError]
) -> AsyncIterator[None]:
    """Fail a request to `service` made within with `error` if it is not answered: given
    `timeout` seconds if not None, transient if it times out or cannot get through."""
    try:
        async with asyncio.timeout(timeout):
            yield
    except TimeoutError as e:
        raise error(f"{service} {timeout:g} 秒内没有回应", transient=True) from e
    except httpx.TransportError as e:
        raise error(f"无法连接{service}：{e!r}", transient=True) from e
    except httpx.HTTPError as e:  # too many redirects, say: no better asked again
        raise error(f"无法连接{service}：{e!r}") from e


async def retry_once(attempt: Callable[[], Awaitable[T]]) -> T:
    """What `attempt` comes to, made again at once if it fails in passing. Raises the
    ServiceError of the attempt failing last."""
    try:
        return await attempt()
    except ServiceError as e:
        if not e.transient:
            raise
        log.info("a request failed in passing; asking again: %s", e)
        if (failed := _on_retry.get()) is not None:
            failed(e)
    return await attempt()


_on_retry: ContextVar[Callable[[ServiceError], None] | None] = ContextVar(
    "on_retry", default=None
)


@contextmanager
def on_retry(failed: Callable[[ServiceError], None]) -> Iterator[None]:
    """Tell `failed` of each attempt made meanwhile, in this context, that failed and is
    being made again, with what it failed with."""
    token = _on_retry.set(failed)
    try:
        yield
    finally:
        _on_retry.reset(token)
