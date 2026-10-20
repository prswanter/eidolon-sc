"""The price catalogs online (GLOSSARY.md「看板」): models.dev's and OpenRouter's lists of
models and what each costs per million tokens, in dollars, input read from the prompt
cache too where they say, for pricing the deployer's service calls in place of the presets
(`prices`). The way magpie prices its calls (github.com/yetone/magpie, `internal/catalog`).

The catalogs are fetched in the background as the server starts, again once they are a
day old, and sooner when a model has no price (`refresh_soon`), or when an admin asks
(`refresh`). Kept in the database, they are matched to a call by the host it was at and
the model it named: the providers at that host (models.dev's `api`, or the few without
one written down here, or OpenRouter), then the model's name, as it is and then looser
and looser. A model at a host no catalog knows (a relay, a proxy) is looked for among
the providers that make models, and priced as its maker prices it. OpenRouter's catalog
is its own API's, not models.dev's copy, which goes without the judge models' prices.
The same hosts are the known providers', which alone users' own LLMs may reach through the
proxy (`known_provider`, ADR-0022).

models.dev's says how each model thinks, too (`Thinking`), found the same way (`thinking`):
for the efforts beside a model's to note which it is listed taking, a hint only, never
what is sent (ADR-0019). OpenRouter's says so in words of its own, not used."""

import asyncio
import ipaddress
import logging
import re
import threading
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal, TypeVar
from urllib.parse import urlsplit

import httpx

from eidolon.clock import Clock
from eidolon.config import REASONING_EFFORTS, LLMProtocol, ReasoningEffort
from eidolon.database import connect

MODELS_DEV_URL = "https://models.dev/api.json"
OPENROUTER_URL = "https://openrouter.ai/api/v1/models?output_modalities=all"
"""Every model OpenRouter has: without `output_modalities=all` the judge models, which
answer with decisions, not text, are left out."""

log = logging.getLogger(__name__)

OPENROUTER = "openrouter"
OPENROUTER_HOST = "openrouter.ai"

HOSTS = {
    "openai": "api.openai.com",
    "anthropic": "api.anthropic.com",
    "google": "generativelanguage.googleapis.com",
    "xai": "api.x.ai",
    "mistral": "api.mistral.ai",
    "cohere": "api.cohere.com",
    "groq": "api.groq.com",
    "cerebras": "api.cerebras.ai",
    "deepinfra": "api.deepinfra.com",
    "togetherai": "api.together.xyz",
    "perplexity": "api.perplexity.ai",
    "venice": "api.venice.ai",
}
"""The hosts of the models.dev providers that do not say where they are served (`api`),
known providers whether or not the catalogs have been fetched (`Catalog.known_provider`)."""

_DOMAIN = re.compile(r"[a-z0-9-]+(\.[a-z0-9-]+)+")
"""A name with a dot in it: not `localhost`, nor a placeholder (`${DATABRICKS_HOST}`)."""


def _is_address(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True

MAKERS = [
    "openai", "anthropic", "google", "deepseek", "xai", "mistral", "moonshotai",
    "alibaba-cn", "zhipuai", "minimax",
]
"""The models.dev providers that make the models they serve, in the order a model at a
host no catalog knows (a relay's) is looked for among them."""

STALE_AFTER = timedelta(hours=24)
"""How old the catalogs may be before they are fetched again."""
MISSING_AFTER = timedelta(hours=6)
"""How long since they were last fetched, or tried, before a model without a price has
them fetched again: they may list it by now."""
RETRY_AFTER = timedelta(minutes=10)
"""How long after a failed fetch before stale catalogs are tried again."""
CHECK_EVERY = 3600
"""How often, in seconds, the server looks whether the catalogs are stale."""


@dataclass(frozen=True)
class Listed:
    """A model a catalog prices: dollars per million input and output tokens (output
    None, priced as input, when the catalog does not say), and input tokens read from the
    prompt cache (None, priced as the rest of the input, when it does not say)."""

    provider: str
    model: str
    input: float
    output: float | None
    cache_read: float | None = None


@dataclass(frozen=True)
class Thinking:
    """How a model thinks, as models.dev lists it (`reasoning`, `reasoning_options`):
    whether it does, the efforts it takes (of `REASONING_EFFORTS`, in their order; none
    for one turned off by an effort), and whether it has a switch of its own to turn
    thinking on and off (`toggle`). One thinking by a budget of tokens, or as it will
    (`[]`, "no caller control"), takes no effort."""

    provider: str
    model: str
    thinks: bool
    efforts: tuple[ReasoningEffort, ...]
    switch: bool


@dataclass(frozen=True)
class State:
    """When the catalogs were last fetched, when and why a fetch last failed since, and
    whether they are being fetched now."""

    fetched_at: datetime | None
    failed_at: datetime | None
    error: str | None
    fetching: bool = False


_SCHEMA = """
-- The price catalogs online as last fetched: each model they price, by provider, in
-- dollars per million tokens; how each model models.dev lists thinks; the host each
-- provider is at; when they were fetched.
CREATE TABLE IF NOT EXISTS price_catalog (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input REAL NOT NULL,
    output REAL,
    cache_read REAL,
    PRIMARY KEY (provider, model)
);
CREATE TABLE IF NOT EXISTS price_catalog_thinking (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    thinks INTEGER NOT NULL,
    efforts TEXT NOT NULL, -- separated by spaces
    switch INTEGER NOT NULL,
    PRIMARY KEY (provider, model)
);
CREATE TABLE IF NOT EXISTS price_catalog_hosts (
    host TEXT NOT NULL,
    provider TEXT NOT NULL,
    PRIMARY KEY (host, provider)
);
CREATE TABLE IF NOT EXISTS price_catalog_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fetched_at TEXT,
    failed_at TEXT,
    error TEXT
);
"""


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
        return None
    return float(value)


def _thinking(provider: str, model: str, m: dict) -> Thinking:
    """How `m` thinks, leaving out the efforts models.dev's own schema does not explain
    (`default`, `null`)."""
    options = m.get("reasoning_options")
    options = [o for o in options if isinstance(o, dict)] if isinstance(options, list) else []
    taken = {
        value
        for o in options
        if o.get("type") == "effort" and isinstance(values := o.get("values"), list)
        for value in values
    }
    return Thinking(
        provider, model, m.get("reasoning") is True,
        tuple(e for e in REASONING_EFFORTS if e in taken),
        any(o.get("type") == "toggle" for o in options),
    )


def parse_models_dev(
    data: object,
) -> tuple[list[Listed], list[Thinking], list[tuple[str, str]]]:
    """The models models.dev prices per token, how each model it lists thinks, and the
    host each provider is at, leaving out its copy of OpenRouter's (`parse_openrouter`)
    and whatever it does not say plainly."""
    listed: list[Listed] = []
    thinking: list[Thinking] = []
    hosts: list[tuple[str, str]] = []
    if not isinstance(data, dict):
        raise ValueError("models.dev: not an object")
    for provider, entry in data.items():
        if provider == OPENROUTER or not isinstance(entry, dict):
            continue
        api = entry.get("api")
        if isinstance(api, str):  # not over HTTPS, it is on this machine or next to it
            host = urlsplit(api).hostname if urlsplit(api).scheme == "https" else None
        else:
            host = HOSTS.get(provider)
        if host:
            hosts.append((host.lower(), provider))
        models = entry.get("models")
        for model, m in (models.items() if isinstance(models, dict) else []):
            if not isinstance(m, dict):
                continue
            thinking.append(_thinking(provider, model, m))
            cost = m.get("cost")
            if not isinstance(cost, dict) or (input := _number(cost.get("input"))) is None:
                continue
            listed.append(Listed(
                provider, model, input, _number(cost.get("output")),
                _number(cost.get("cache_read")),
            ))
    return listed, thinking, hosts


def parse_openrouter(data: object) -> list[Listed]:
    """The models OpenRouter prices, its prices per token made per million tokens; a
    price it gives as -1 (one that varies, its router's) is left out, and a price for the
    input read from the cache that is not a plain one is as none."""
    models = data.get("data") if isinstance(data, dict) else None
    if not isinstance(models, list):
        raise ValueError("OpenRouter: no list of models")
    listed = []
    for m in models:
        pricing = m.get("pricing") if isinstance(m, dict) else None
        if not isinstance(pricing, dict) or not isinstance(m.get("id"), str):
            continue
        try:
            input = float(pricing["prompt"])
            output = float(pricing["completion"]) if "completion" in pricing else None
        except (KeyError, TypeError, ValueError):
            continue
        if input < 0 or (output is not None and output < 0):
            continue
        cache_read = _per_token(pricing.get("input_cache_read"))
        listed.append(Listed(
            OPENROUTER, m["id"], round(input * 1_000_000, 9),
            None if output is None else round(output * 1_000_000, 9),
            None if cache_read is None else round(cache_read * 1_000_000, 9),
        ))
    return listed


def _per_token(value: object) -> float | None:
    """An OpenRouter price per token, given as text, if it is one and not below 0."""
    try:
        price = float(value)  # pyright: ignore[reportArgumentType]
    except (TypeError, ValueError):
        return None
    return price if price >= 0 else None


def _bare(model: str) -> str:
    """A model's name without a path (a vendor's, a relay's), in lower case."""
    return model.lower().rsplit("/", 1)[-1]


def _cut(name: str, at: str) -> str:
    return name.split(at, 1)[0].strip()


def _dashed(model: str) -> str:
    """A model's bare name with its dots as dashes: how two vendors writing a version
    4.6 and 4-6 are compared."""
    return _bare(model).replace(".", "-")


T = TypeVar("T")


def _match(listing: Mapping[str, Mapping[str, T]], providers: list[str], model: str) -> T | None:
    """What the first of `providers` listing `model` in `listing` (by provider, then by
    model) has for it: by its name as it is, then without a path or case
    (`openai/GPT-6-Sol` is `gpt-6-sol`), then without a `:tag` or a `(variant)` too, then
    with a dot taken for a dash (`claude-opus-4.6` is `claude-opus-4-6`). Of two a
    provider lists under names the same once loosened, the first by name."""
    for provider in providers:
        if (found := listing.get(provider, {}).get(model)) is not None:
            return found
    bare = _bare(model)
    untagged = _cut(_cut(bare, ":"), "(")
    loosened = [(_bare, bare), (_bare, untagged), (_dashed, untagged.replace(".", "-"))]
    for loosen, want in loosened:
        for provider in providers:
            listed = listing.get(provider, {})
            names = sorted(name for name in listed if loosen(name) == want)
            if names:
                return listed[names[0]]
    return None


class Catalog:
    """The price catalogs as last fetched, fetching them again on asking (`refresh`)."""

    def __init__(
        self, path: Path, clock: Clock, transport: httpx.BaseTransport | None = None
    ) -> None:
        self._db = connect(path)
        self._lock = threading.Lock()
        with self._lock, self._db:
            self._db.executescript(_SCHEMA)
            columns = {name for _, name, *_ in self._db.execute("PRAGMA table_info(price_catalog)")}
            # Catalogs fetched before cache prices were kept have none until fetched again.
            if "cache_read" not in columns:
                self._db.execute("ALTER TABLE price_catalog ADD COLUMN cache_read REAL")
        self._clock = clock
        self._fetching = threading.Lock()
        self._background: threading.Thread | None = None
        self._starting = threading.Lock()
        self._closed = False
        self._http = httpx.Client(
            transport=transport, timeout=60, headers={"User-Agent": "eidolon-sc"},
            follow_redirects=True,
        )
        self._load()

    def _load(self) -> None:
        with self._lock:
            listed = self._db.execute(
                "SELECT provider, model, input, output, cache_read FROM price_catalog"
            ).fetchall()
            thinking = self._db.execute(
                "SELECT provider, model, thinks, efforts, switch FROM price_catalog_thinking"
            ).fetchall()
            hosts = self._db.execute("SELECT host, provider FROM price_catalog_hosts").fetchall()
            state = self._db.execute(
                "SELECT fetched_at, failed_at, error FROM price_catalog_state"
            ).fetchone()
        models: dict[str, dict[str, Listed]] = {}
        for provider, model, input, output, cache_read in listed:
            models.setdefault(provider, {})[model] = Listed(
                provider, model, input, output, cache_read
            )
        thinks: dict[str, dict[str, Thinking]] = {}
        for provider, model, does, efforts, switch in thinking:
            taken = efforts.split()
            thinks.setdefault(provider, {})[model] = Thinking(
                provider, model, bool(does),
                tuple(e for e in REASONING_EFFORTS if e in taken), bool(switch),
            )
        at: dict[str, list[str]] = {OPENROUTER_HOST: [OPENROUTER]}
        for host, provider in hosts:
            at.setdefault(host, []).append(provider)
        self._models = models
        self._thinking = thinks
        self._hosts = {host: sorted(set(providers)) for host, providers in at.items()}
        when = lambda s: datetime.fromisoformat(s) if s else None  # noqa: E731
        self._state = (
            State(when(state[0]), when(state[1]), state[2]) if state else State(None, None, None)
        )

    def state(self) -> State:
        return replace(self._state, fetching=self._busy())

    def _busy(self) -> bool:
        return self._fetching.locked() or (
            self._background is not None and self._background.is_alive()
        )

    def refresh_soon(self, missing: bool = False) -> None:
        """Fetch the catalogs again in the background if they are stale (`STALE_AFTER`),
        or if a model is `missing` a price and they were last tried `MISSING_AFTER` ago;
        a failed fetch is not tried again for `RETRY_AFTER`. Returns at once."""
        state, now = self._state, self._clock()
        tried = max((d for d in [state.fetched_at, state.failed_at] if d), default=None)
        stale = state.fetched_at is None or now - state.fetched_at >= STALE_AFTER
        due = (
            tried is None
            or (stale and now - tried >= RETRY_AFTER)
            or (missing and now - tried >= MISSING_AFTER)
        )
        with self._starting:
            if not due or self._closed or self._busy():
                return
            self._background = threading.Thread(
                target=self.refresh, name="price-catalog", daemon=True
            )
            self._background.start()

    async def keep_fresh(self) -> None:
        """Look whether the catalogs are stale now and every `CHECK_EVERY` seconds after,
        until cancelled."""
        while True:
            self.refresh_soon()
            await asyncio.sleep(CHECK_EVERY)

    def known_provider(self, host: str) -> bool:
        """Whether `host` is where a provider the catalogs list serves its models over
        HTTPS, or one of those written down here (GLOSSARY.md「已知服务商」): a name on the
        internet, not an address, nor a name for this machine, nor a placeholder
        (`https://${DATABRICKS_HOST}`)."""
        host = host.lower().rstrip(".")
        listed = host in self._hosts or host in HOSTS.values()
        named = _DOMAIN.fullmatch(host) is not None and not host.endswith(".localhost")
        return listed and named and not _is_address(host)

    def find(self, host: str, model: str) -> tuple[Listed, bool] | None:
        """The catalogs' price of `model` at `host`, if they have one, and whether it is
        its maker's, for a host no catalog knows (a relay, a proxy): what it is likely
        to cost there, not what it does."""
        return self._find(self._models, host, model)

    def thinking(self, host: str, model: str) -> Thinking | None:
        """How `model` at `host` thinks, as models.dev lists it, found as its price is
        (`find`): at a host no catalog knows, as its maker lists it."""
        found = self._find(self._thinking, host, model)
        return found[0] if found else None

    def _find(
        self, listing: Mapping[str, Mapping[str, T]], host: str, model: str
    ) -> tuple[T, bool] | None:
        providers = self._hosts.get(host.lower())
        if providers:
            found = _match(listing, providers, model)
            return (found, False) if found is not None else None
        # its maker first, where its name says (`deepseek/deepseek-v4-pro`)
        named = model.lower().split("/", 1)[0] if "/" in model else None
        found = _match(listing, sorted(MAKERS, key=lambda m: m != named), model)
        return (found, True) if found is not None else None

    def refresh(self) -> None:
        """Fetch the catalogs again, keeping the ones last fetched if either fails; when
        they are being fetched already, wait for that instead. Blocks: call it from a
        thread of its own, not the event loop."""
        if not self._fetching.acquire(blocking=False):
            with self._fetching:
                return
        try:
            now = self._clock()
            try:
                listed, thinking, hosts = parse_models_dev(self._get(MODELS_DEV_URL))
                listed += parse_openrouter(self._get(OPENROUTER_URL))
            except (httpx.HTTPError, ValueError) as e:
                log.warning("could not fetch the price catalogs: %s", e)
                self._save_failure(now, f"{type(e).__name__}: {e}"[:500])
            else:
                self._save(now, listed, thinking, hosts)
            self._load()
        finally:
            self._fetching.release()

    def _get(self, url: str) -> object:
        response = self._http.get(url)
        response.raise_for_status()
        return response.json()

    def _save(
        self,
        now: datetime,
        listed: Iterable[Listed],
        thinking: Iterable[Thinking],
        hosts: Iterable[tuple[str, str]],
    ) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM price_catalog")
            self._db.executemany(
                "INSERT OR REPLACE INTO price_catalog (provider, model, input, output, cache_read)"
                " VALUES (?, ?, ?, ?, ?)",
                ((m.provider, m.model, m.input, m.output, m.cache_read) for m in listed),
            )
            self._db.execute("DELETE FROM price_catalog_thinking")
            self._db.executemany(
                "INSERT OR REPLACE INTO price_catalog_thinking"
                " (provider, model, thinks, efforts, switch) VALUES (?, ?, ?, ?, ?)",
                (
                    (t.provider, t.model, t.thinks, " ".join(t.efforts), t.switch)
                    for t in thinking
                ),
            )
            self._db.execute("DELETE FROM price_catalog_hosts")
            self._db.executemany(
                "INSERT OR IGNORE INTO price_catalog_hosts (host, provider) VALUES (?, ?)", hosts
            )
            self._db.execute(
                "INSERT OR REPLACE INTO price_catalog_state (id, fetched_at, failed_at, error)"
                " VALUES (1, ?, NULL, NULL)",
                (now.isoformat(),),
            )

    def _save_failure(self, now: datetime, error: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO price_catalog_state (id, failed_at, error) VALUES (1, ?, ?)"
                " ON CONFLICT (id) DO UPDATE SET failed_at = excluded.failed_at,"
                " error = excluded.error",
                (now.isoformat(), error),
            )

    def close(self) -> None:
        with self._starting:
            self._closed = True
        if self._background is not None:  # let a fetch under way finish
            self._background.join()
        with self._fetching:
            self._http.close()
            self._db.close()


TurnsOff = Literal["by_effort", "by_switch"]
"""How a model's thinking is turned off, as models.dev lists it: by the effort none, or
by a switch of its own, which a protocol's none may not be."""


def describe_thinking(thinking: Thinking, protocol: LLMProtocol) -> dict:
    """How a model thinks, as models.dev lists it, for the efforts `protocol` sends: the
    efforts it takes save none, and how it is turned off (`TurnsOff`), if it is. The
    Anthropic protocol's none is a switch (`thinking: disabled`)."""
    turns_off: TurnsOff | None = (
        "by_effort" if "none" in thinking.efforts or (thinking.switch and protocol == "anthropic")
        else "by_switch" if thinking.switch else None
    )
    return {
        "provider": thinking.provider,
        "model": thinking.model,
        "thinks": thinking.thinks,
        "efforts": [e for e in thinking.efforts if e != "none"],
        "turns_off": turns_off,
    }


def describe_state(state: State) -> dict:
    iso: Callable[[datetime | None], str | None] = lambda d: d.isoformat() if d else None  # noqa: E731
    return {
        "fetched_at": iso(state.fetched_at),
        "failed_at": iso(state.failed_at),
        "error": state.error,
        "fetching": state.fetching,
    }
