"""The efforts a model is listed taking in models.dev's catalog (GLOSSARY.md「思考强度」),
for the admin console and the settings page to note beside each effort: a hint only,
never what is sent nor what may be saved (ADR-0019). Fetched with the price catalogs
and matched to a model as its price is; driven through the backend's external API, the
catalogs served by a fake over HTTP from a recording of models.dev's (cut down to a few
of its providers and models)."""

import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from eidolon.config import Settings
from tests.conftest import ClientFactory
from tests.fakes import FakeCatalog, FakeClock, FakeIdentityProvider, FakeLLM
from tests.test_price_catalog import REFRESH, admin_on, fetches_on_looking, models_dev

HINTS = "/api/account/keys/llm/efforts"

MODELS_DEV = json.loads(
    (Path(__file__).parent / "recordings" / "models_dev.json").read_text(encoding="utf-8")
)
"""models.dev's catalog as fetched on 2026-10-14, cut down."""


@pytest.fixture
def settings(settings: Settings) -> Settings:
    """The tests' settings, where the GitHub user 1001 is an admin."""
    return replace(settings, admins=frozenset({("github", "1001")}))


async def hint(
    client: httpx.AsyncClient, base_url: str, model: str, protocol: str = "chat-completions"
) -> dict | None:
    response = await client.get(
        HINTS, params={"protocol": protocol, "base_url": base_url, "model": model}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def fetched(
    make_client: ClientFactory, github: FakeIdentityProvider, catalog: FakeCatalog
) -> httpx.AsyncClient:
    """An admin, the catalogs fetched."""
    admin = await admin_on(make_client, github, FakeClock(), catalog)
    await admin.post(REFRESH)
    return admin


async def test_the_efforts_models_dev_lists_a_model_taking_and_whether_it_turns_off(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await fetched(make_client, github, FakeCatalog(MODELS_DEV))

    openai, anthropic = "https://api.openai.com/v1", "https://api.anthropic.com/v1"
    google = "https://generativelanguage.googleapis.com/v1beta/openai"
    assert await hint(admin, openai, "gpt-6-sol", "responses") == {
        "provider": "openai", "model": "gpt-6-sol", "thinks": True,
        "efforts": ["low", "medium", "high", "xhigh", "max"], "turns_off": "by_effort",
    }
    # On and off by a switch, besides its efforts: turning it off is what the Anthropic
    # protocol's none sends, but another protocol's is an effort, which the switch may
    # not be.
    deepseek = await hint(admin, "https://api.deepseek.com", "deepseek-v4-pro") or {}
    assert deepseek == {
        "provider": "deepseek", "model": "deepseek-v4-pro", "thinks": True,
        "efforts": ["low", "high", "max"], "turns_off": "by_switch",
    }
    assert await hint(admin, "https://api.deepseek.com/anthropic", "deepseek-v4-pro", "anthropic") == {
        **deepseek, "turns_off": "by_effort",
    }
    assert (await hint(admin, anthropic, "claude-opus-5-5", "anthropic") or {})["turns_off"] is None
    assert await hint(admin, google, "gemini-3.5-flash") == {
        "provider": "google", "model": "gemini-3.5-flash", "thinks": True,
        "efforts": ["minimal", "low", "medium", "high"], "turns_off": None,
    }
    # Thinking by a budget of tokens, or only on and off, takes no effort; nor does one
    # thinking as it will ("no caller control"), or one that does not think. A model
    # the catalog does not price is listed all the same.
    no_efforts = {
        (anthropic, "claude-sonnet-4-5"): (True, None),
        (google, "gemma-4-31b-it"): (True, "by_switch"),
        (google, "gemini-omni-flash-preview"): (True, None),
        (openai, "gpt-4o"): (False, None),
    }
    for (base_url, model), (thinks, turns_off) in no_efforts.items():
        found = await hint(admin, base_url, model)
        assert found and (found["thinks"], found["efforts"], found["turns_off"]) == (
            thinks, [], turns_off
        ), model
    # Of an effort models.dev's own schema does not explain (null, "default"), nothing is said.
    sarvam = await hint(admin, "https://api.sarvam.ai/v1", "sarvam-30b")
    assert sarvam and sarvam["efforts"] == ["low", "medium", "high"]


async def test_a_model_is_matched_as_its_price_is(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await fetched(make_client, github, FakeCatalog(MODELS_DEV))

    anthropic = "https://api.anthropic.com/v1"
    # by its name loosened (`test_price_catalog`); at a host no catalog knows, as its
    # maker lists it
    assert (await hint(admin, anthropic, "Claude-Opus-5.5") or {})["model"] == "claude-opus-5-5"
    relayed = await hint(admin, "https://relay.example/v1", "openai/GPT-6-Sol")
    assert relayed and (relayed["provider"], relayed["model"]) == ("openai", "gpt-6-sol")
    # Not at a host the catalog knows, which does not list it; nor from OpenRouter's,
    # whose efforts are not used.
    assert await hint(admin, "https://api.deepseek.com", "claude-opus-5-5") is None
    assert await hint(admin, "https://openrouter.ai/api/v1", "openai/gpt-6-sol") is None
    assert await hint(admin, anthropic, "claude-unknown") is None
    assert await hint(admin, "http://[", "gpt-6-sol") is None


async def test_any_user_signed_in_may_ask_and_no_one_else(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    catalog = FakeCatalog(MODELS_DEV)
    await fetched(make_client, github, catalog)
    user = make_client(FakeLLM(), catalog_transport=catalog.transport())
    stranger = make_client(FakeLLM(), user=None, catalog_transport=catalog.transport())

    found = await hint(user, "https://api.deepseek.com", "deepseek-v4-pro")
    refused = await stranger.get(HINTS, params={
        "protocol": "chat-completions", "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-pro",
    })

    assert found and found["efforts"] == ["low", "high", "max"]
    assert refused.status_code == 401


async def test_a_model_not_listed_has_the_catalogs_fetched_again_at_most_every_six_hours(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    catalog = FakeCatalog()
    admin = await admin_on(make_client, github, clock, catalog)
    await admin.post(REFRESH)

    clock.advance(hours=5)
    assert await hint(admin, "https://llm.example/v1", "m-new") is None
    assert await fetches_on_looking(admin, catalog) == 0
    catalog.models_dev = models_dev("example", "https://llm.example/v1", {"m-new": (1, 1)})
    catalog.models_dev["example"]["models"]["m-new"] |= {
        "reasoning": True, "reasoning_options": [{"type": "effort", "values": ["high"]}],
    }
    clock.advance(hours=1)
    assert await hint(admin, "https://llm.example/v1", "m-new") is None
    await fetches_on_looking(admin, catalog)  # waits for the fetch under way

    assert (await hint(admin, "https://llm.example/v1", "m-new") or {})["efforts"] == ["high"]
    assert catalog.fetches == 2
