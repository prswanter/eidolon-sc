"""Asking whether the user's use would count towards their limits, for the settings page:
the services their browser keeps their own keys for (`own`) are named, none of the keys,
and it is told for text turns and for calls alike, by the one rule turns and calls are
counted by (see test_own_keys). Only asked: no key is touched, and the user's own limits
and whether calls are available are not looked at."""

import httpx

from tests.conftest import ClientFactory, github_identity, sign_in_with
from tests.fakes import FakeIdentityProvider, FakeLLM


async def exemption(client: httpx.AsyncClient, *services: str) -> httpx.Response:
    """Ask, as the settings page does, with the user's own keys kept for `services`."""
    return await client.get("/api/account/keys/exemption", params={"own": ",".join(services)})


async def test_it_is_answered_by_the_rule_even_where_the_deployer_has_no_speech_keys(
    make_client: ClientFactory,
):
    client = make_client(FakeLLM(), voice_configured=False)

    for services, answer in [
        ((), {"turns": False, "calls": False}),
        (("llm",), {"turns": True, "calls": False}),
        (("llm", "tts", "stt"), {"turns": True, "calls": True}),
    ]:
        assert (await exemption(client, *services)).json() == answer, services


async def test_it_needs_services_there_are(make_client: ClientFactory):
    client = make_client(FakeLLM())

    assert (await exemption(client, "llm", "gpu")).status_code == 422


async def test_it_needs_a_user_signed_in_who_has_agreed_to_the_terms(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    assert (await exemption(make_client(FakeLLM(), user=None), "llm")).status_code == 401
    client = make_client(FakeLLM(), user=None)
    await sign_in_with(client, github, github_identity())

    assert (await exemption(client, "llm")).status_code == 428
