"""What a request to an outside service is billed for, as the service itself says.

A service's client tells it here (`bill`) as it reads the service's answer: an LLM its
input and output tokens, and how many of the input hit the provider's prompt cache; a
reranker the tokens it read. Whoever times the request for its activity record
(`activity`) opens a `Billing` around it (`billing`) and reads it off afterwards; with
none open, as for the startup checks, what the client says goes nowhere.
A client that is never told, or a service that never says, leaves the usage unknown: it
is never guessed.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

Unit = str
"""What a service bills by: "tokens" for the LLMs, the embedders and the reranker, as
the service names it otherwise."""


@dataclass
class Billing:
    """What one request was billed for so far: in `unit`, its input and, where the service
    bills output apart (an LLM), its output; of the input, how much the provider read from
    its prompt cache (`cached`, an LLM's); None where not told."""

    unit: Unit | None = None
    input: float | None = None
    output: float | None = None
    cached: float | None = None

    def take(self) -> "Billing":
        """What it was billed for so far, which it then forgets: what an attempt that
        failed and is made again was billed for, apart from the next."""
        taken = Billing(self.unit, self.input, self.output, self.cached)
        self.unit = self.input = self.output = self.cached = None
        return taken


_open: ContextVar[Billing | None] = ContextVar("billing", default=None)


def bill(
    unit: Unit, input: float | None, output: float | None = None, cached: float | None = None
) -> None:
    """The request being made is billed `input` (and `output`) more in `unit`, `cached` of
    the input read from the prompt cache: a request made in several parts (embedding in
    batches) adds up."""
    billing = _open.get()
    if billing is None:
        return
    billing.unit = unit
    if input is not None:
        billing.input = (billing.input or 0) + input
    if output is not None:
        billing.output = (billing.output or 0) + output
    if cached is not None:
        billing.cached = (billing.cached or 0) + cached


@contextmanager
def billing(into: Billing) -> Iterator[Billing]:
    """Have what is billed meanwhile, in this context, told to `into`. Opened and closed
    with nothing awaited in between it but the request itself, so it is closed in the
    context it was opened in."""
    token = _open.set(into)
    try:
        yield into
    finally:
        _open.reset(token)
