"""The admin command line: listing users with their sign-in methods, banning them (with a
note only admins see) and unbanning them, and looking over their usage. A ban signs the user out everywhere, keeps them from
signing in and hangs up their calls."""

import sqlite3

import httpx
import pytest

import eidolon.call
from eidolon.config import Settings
from tests.browser import Browser
from tests.conftest import (
    Admin,
    ClientFactory,
    agree_to_terms,
    github_identity,
    google_identity,
    sign_in_with,
)
from tests.fakes import FakeIdentityProvider, FakeLLM, FakeLLMService, FakeSpeech
from tests.test_text_turn import send_turn, start_conversation

REPLY = ["<ja>はいっ</ja><zh>好的</zh>"]


def user_id(settings: Settings, name: str) -> str:
    with sqlite3.connect(settings.database_path) as db:
        [(found,)] = db.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchall()
    return found


async def github_user(make_client: ClientFactory, github: FakeIdentityProvider) -> httpx.AsyncClient:
    client = make_client(FakeLLM(), user=None)
    await sign_in_with(client, github, github_identity(name="octo"))
    await agree_to_terms(client)
    return client


async def test_listing_users_shows_their_sign_in_methods_and_whether_banned(
    make_client: ClientFactory,
    admin: Admin,
    settings: Settings,
    github: FakeIdentityProvider,
    google: FakeIdentityProvider,
):
    client = await github_user(make_client, github)
    await sign_in_with(client, google, google_identity(name="Octo G"), link=True)
    make_client(FakeLLM(), "friend")
    admin.run("user", "ban", user_id(settings, "friend"), "--note", "刷量，见工单 12")

    listing = admin.run("user", "list").splitlines()

    octo, friend = listing
    assert octo.startswith(user_id(settings, "octo"))
    assert "GitHub octo (github:1001)、Google Octo G (google:g-1001)" in octo and "正常" in octo
    assert friend.startswith(user_id(settings, "friend"))
    assert "（没有登录方式）" in friend and "已封禁于" in friend
    assert "备注：刷量，见工单 12" in friend


async def test_a_banned_user_is_signed_out_and_cannot_sign_in_until_unbanned(
    make_client: ClientFactory, admin: Admin, settings: Settings, github: FakeIdentityProvider
):
    client = await github_user(make_client, github)
    octo = user_id(settings, "octo")

    admin.run("user", "ban", octo)

    assert (await client.get("/api/account")).status_code == 401
    refused = await sign_in_with(client, github, github_identity(name="octo"))
    assert refused.headers["location"] == "/login?error=banned"

    admin.run("user", "unban", octo)

    welcome = await sign_in_with(client, github, github_identity(name="octo"))
    assert welcome.headers["location"] == "/conversations"
    assert (await client.get("/api/account")).status_code == 200


async def test_a_request_from_a_banned_users_session_is_forbidden(
    make_client: ClientFactory, settings: Settings
):
    client = make_client(FakeLLM())
    with sqlite3.connect(settings.database_path) as db:  # banned while the session was in use
        db.execute("UPDATE users SET banned_at = '2026-09-27T00:00:00+00:00'")

    res = await client.get("/api/account")

    assert res.status_code == 403
    assert "封禁" in res.json()["detail"]


async def test_banning_hangs_up_the_users_call(
    make_client: ClientFactory,
    admin: Admin,
    settings: Settings,
    speech: FakeSpeech,
    browser: Browser,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(eidolon.call, "USER_CHECK_INTERVAL", 0.05)
    client = make_client(FakeLLM())
    await browser.call(client, conversation_id=await start_conversation(client))
    await browser.connect()

    admin.run("user", "ban", user_id(settings, "producer"))

    await browser.hung_up()


async def test_usage_shows_the_last_day_by_hour_and_what_was_on_own_keys(
    make_client: ClientFactory, admin: Admin, settings: Settings, own_llm: FakeLLMService
):
    own_llm.llm = FakeLLM(REPLY)
    client = make_client(FakeLLM(REPLY, REPLY))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "在吗")
    await send_turn(client, conversation_id, "在吗")
    await send_turn(client, conversation_id, "在吗", own_llm={
        "base_url": "https://llm.example.com/v1", "api_key": "sk-own-key-1234", "model": "m",
    })

    out = admin.run("user", "usage", user_id(settings, "producer")).splitlines()

    assert "最近 24 小时" in out[0]
    [hour] = out[2:-1]
    assert hour.endswith("\t3\t0\t1\t0")
    assert out[-1] == "合计\t3\t0\t1\t0"


def test_commands_on_unknown_users_fail_saying_so(admin: Admin):
    for action in ("ban", "unban", "usage"):
        assert "nobody" in admin.fails("user", action, "nobody")


def test_users_are_no_longer_made_on_the_command_line(admin: Admin):
    with pytest.raises(SystemExit):
        admin.invoke("user", "create", "producer")
