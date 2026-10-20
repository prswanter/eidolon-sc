"""Identity providers: Google and GitHub, which tell the backend who is signing in.

Each sends the browser to its own page to sign in (`authorize_url`), then back to the
backend's callback with a one-off code, which the backend trades for the identity
(`identify`). The `state` carried there and back is the caller's to check. Whether an
identity may sign in at all is not the provider's call: see `accounts`.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol, get_args
from urllib.parse import urlencode

import httpx

from eidolon.config import OAuthSettings

ProviderName = Literal["github", "google"]
PROVIDER_NAMES: tuple[ProviderName, ...] = get_args(ProviderName)
PROVIDER_LABELS: dict[ProviderName, str] = {"github": "GitHub", "google": "Google"}


@dataclass(frozen=True)
class Identity:
    """Who the provider says is signing in."""

    provider: ProviderName
    subject: str
    """The provider's own, unchanging id for the account."""
    display_name: str
    email: str | None
    email_verified: bool
    created_at: datetime | None
    """When the account was made, if the provider says (GitHub does, Google does not)."""


class IdentityError(Exception):
    """The provider refused the code or could not be reached."""


class IdentityProvider(Protocol):
    name: ProviderName

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        """The provider's page that signs the browser in, then sends it to `redirect_uri`
        with a code and `state`."""
        ...

    async def identify(self, code: str, redirect_uri: str) -> Identity:
        """The identity the code from the callback stands for. Raises IdentityError."""
        ...

    async def aclose(self) -> None: ...


_TIMEOUT = httpx.Timeout(15, connect=10)


class GitHubProvider:
    """GitHub's OAuth app flow. Asks only to read the profile and email addresses."""

    name: ProviderName = "github"
    AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    API_URL = "https://api.github.com"

    def __init__(self, settings: OAuthSettings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=_TIMEOUT)

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        query = {
            "client_id": self._settings.client_id,
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
        return f"{self.AUTHORIZE_URL}?{urlencode(query)}"

    async def identify(self, code: str, redirect_uri: str) -> Identity:
        token = await _token(
            self._client,
            self.TOKEN_URL,
            {
                "client_id": self._settings.client_id,
                "client_secret": self._settings.client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }
        user = await _get_json(self._client, f"{self.API_URL}/user", headers)
        emails = await _get_json(self._client, f"{self.API_URL}/user/emails", headers)
        primary = next(
            (e for e in emails if isinstance(e, dict) and e.get("primary")), None
        ) if isinstance(emails, list) else None
        try:
            return Identity(
                provider="github",
                subject=str(user["id"]),
                display_name=user.get("name") or user["login"],
                email=primary["email"] if primary else user.get("email"),
                email_verified=bool(primary and primary.get("verified")),
                created_at=datetime.fromisoformat(user["created_at"]),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise IdentityError(f"GitHub 返回的用户资料无法识别：{e!r}") from None

    async def aclose(self) -> None:
        await self._client.aclose()


class GoogleProvider:
    """Google's OpenID Connect flow. Asks only for the account id, email and profile."""

    name: ProviderName = "google"
    AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

    def __init__(self, settings: OAuthSettings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=_TIMEOUT)

    def authorize_url(self, state: str, redirect_uri: str) -> str:
        query = {
            "client_id": self._settings.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        return f"{self.AUTHORIZE_URL}?{urlencode(query)}"

    async def identify(self, code: str, redirect_uri: str) -> Identity:
        token = await _token(
            self._client,
            self.TOKEN_URL,
            {
                "client_id": self._settings.client_id,
                "client_secret": self._settings.client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        info = await _get_json(
            self._client, self.USERINFO_URL, {"Authorization": f"Bearer {token}"}
        )
        try:
            return Identity(
                provider="google",
                subject=str(info["sub"]),
                display_name=info.get("name") or info.get("email") or "Google 用户",
                email=info.get("email"),
                email_verified=info.get("email_verified") is True,
                created_at=None,
            )
        except (KeyError, TypeError) as e:
            raise IdentityError(f"Google 返回的用户资料无法识别：{e!r}") from None

    async def aclose(self) -> None:
        await self._client.aclose()


def open_identity_providers(
    github: OAuthSettings | None, google: OAuthSettings | None
) -> dict[ProviderName, IdentityProvider]:
    """The providers that are configured."""
    providers: dict[ProviderName, IdentityProvider] = {}
    if github is not None:
        providers["github"] = GitHubProvider(github)
    if google is not None:
        providers["google"] = GoogleProvider(google)
    return providers


async def _token(client: httpx.AsyncClient, url: str, form: dict[str, str]) -> str:
    """Trade the callback's code for an access token."""
    body = await _json(
        client, client.build_request("POST", url, data=form, headers={"Accept": "application/json"})
    )
    token = body.get("access_token") if isinstance(body, dict) else None
    if not isinstance(token, str) or not token:
        error = body.get("error") if isinstance(body, dict) else None
        raise IdentityError(f"换取访问令牌失败：{error or body!r}")
    return token


async def _get_json(client: httpx.AsyncClient, url: str, headers: dict[str, str]) -> Any:
    return await _json(client, client.build_request("GET", url, headers=headers))


async def _json(client: httpx.AsyncClient, request: httpx.Request) -> Any:
    try:
        response = await client.send(request)
    except httpx.HTTPError as e:
        raise IdentityError(f"连不上 {request.url.host}：{e!r}") from None
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.is_error or body is None:
        raise IdentityError(f"{request.url.host} 返回 {response.status_code}：{response.text[:200]}")
    return body
