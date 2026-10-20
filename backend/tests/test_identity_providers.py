"""The GitHub and Google adapters: the sign-in page they send the browser to, and trading
the callback's code for the identity, against the providers' APIs as they answer."""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from eidolon.config import OAuthSettings
from eidolon.identity import GitHubProvider, GoogleProvider, Identity, IdentityError

APP = OAuthSettings("client-id", "client-secret")
CALLBACK = "https://eidolon.example.com/api/auth/github/callback"


def github_api(
    user: dict, emails: list[dict], token: dict | None = None
) -> tuple[GitHubProvider, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/login/oauth/access_token":
            return httpx.Response(200, json=token or {"access_token": "gho_token", "token_type": "bearer"})
        if request.url.path == "/user":
            return httpx.Response(200, json=user)
        if request.url.path == "/user/emails":
            return httpx.Response(200, json=emails)
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    return GitHubProvider(APP, client), requests


def test_github_asks_only_to_read_the_profile_and_email():
    provider = GitHubProvider(APP)

    url = urlsplit(provider.authorize_url("the-state", CALLBACK))
    query = parse_qs(url.query)

    assert f"{url.scheme}://{url.netloc}{url.path}" == GitHubProvider.AUTHORIZE_URL
    assert query == {
        "client_id": ["client-id"],
        "redirect_uri": [CALLBACK],
        "scope": ["read:user user:email"],
        "state": ["the-state"],
    }


async def test_github_trades_the_code_for_the_account_with_its_age_and_primary_email():
    provider, requests = github_api(
        {"id": 583231, "login": "octocat", "name": "The Octocat", "email": None,
         "created_at": "2011-01-25T18:44:36Z"},
        [{"email": "old@example.com", "primary": False, "verified": True},
         {"email": "octocat@example.com", "primary": True, "verified": True}],
    )

    identity = await provider.identify("the-code", CALLBACK)

    assert identity == Identity(
        "github", "583231", "The Octocat", "octocat@example.com", True,
        datetime(2011, 1, 25, 18, 44, 36, tzinfo=UTC),
    )
    token = requests[0]
    assert parse_qs(token.content.decode()) == {
        "client_id": ["client-id"], "client_secret": ["client-secret"],
        "code": ["the-code"], "redirect_uri": [CALLBACK],
    }
    assert token.headers["Accept"] == "application/json"
    assert requests[1].headers["Authorization"] == "Bearer gho_token"
    await provider.aclose()


async def test_github_falls_back_to_the_login_without_a_display_name():
    provider, _ = github_api(
        {"id": 1, "login": "octocat", "name": None, "created_at": "2011-01-25T18:44:36Z"}, []
    )

    identity = await provider.identify("the-code", CALLBACK)

    assert identity.display_name == "octocat"
    assert identity.email is None and not identity.email_verified
    await provider.aclose()


async def test_github_refusing_the_code_is_an_identity_error():
    provider, requests = github_api(
        {}, [], token={"error": "bad_verification_code", "error_description": "expired"}
    )

    with pytest.raises(IdentityError, match="bad_verification_code"):
        await provider.identify("stale-code", CALLBACK)
    assert len(requests) == 1
    await provider.aclose()


def test_google_asks_only_for_openid_email_and_profile():
    provider = GoogleProvider(APP)

    query = parse_qs(urlsplit(provider.authorize_url("the-state", CALLBACK)).query)

    assert query["scope"] == ["openid email profile"]
    assert query["response_type"] == ["code"]
    assert query["state"] == ["the-state"] and query["redirect_uri"] == [CALLBACK]


@pytest.mark.parametrize("verified", [True, False])
async def test_google_trades_the_code_for_the_account_and_whether_its_email_is_verified(
    verified: bool,
):
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "ya29.token", "id_token": "…"})
        return httpx.Response(200, json={
            "sub": "10769150350006150715113082367", "name": "Producer",
            "email": "producer@gmail.com", "email_verified": verified,
        })

    provider = GoogleProvider(APP, httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    identity = await provider.identify("the-code", CALLBACK)

    assert identity == Identity(
        "google", "10769150350006150715113082367", "Producer", "producer@gmail.com", verified, None
    )
    assert parse_qs(requests[0].content.decode())["grant_type"] == ["authorization_code"]
    assert str(requests[1].url) == GoogleProvider.USERINFO_URL
    await provider.aclose()


async def test_an_unreachable_provider_is_an_identity_error():
    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    provider = GoogleProvider(APP, httpx.AsyncClient(transport=httpx.MockTransport(handle)))

    with pytest.raises(IdentityError):
        await provider.identify("the-code", CALLBACK)
    await provider.aclose()


def test_oauth_apps_are_configured_in_pairs(monkeypatch: pytest.MonkeyPatch):
    assert OAuthSettings.from_env("GITHUB") is None

    monkeypatch.setenv("GITHUB_CLIENT_ID", "id")
    with pytest.raises(RuntimeError, match="GITHUB_CLIENT_SECRET"):
        OAuthSettings.from_env("GITHUB")

    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "secret")
    assert OAuthSettings.from_env("GITHUB") == OAuthSettings("id", "secret")
