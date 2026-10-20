"""Announcements (GLOSSARY.md「公告」): admins write them in the admin console, as drafts
first, then publish, edit, withdraw or delete them; users see the latest ones published,
newest first, and nothing of who wrote them. Editing a published one keeps when it was
published; withdrawing it and publishing it again makes it new."""

from dataclasses import replace

import httpx
import pytest

from eidolon.config import Settings
from tests.conftest import ClientFactory, github_identity, sign_in_with
from tests.fakes import FakeClock, FakeIdentityProvider, FakeLLM
from tests.test_admin_users import ADMIN, admin_client, github_user

SHOWN = 20
"""How many announcements users see at most."""


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return replace(settings, admins=frozenset({ADMIN}))


async def write(admin: httpx.AsyncClient, body: str) -> dict:
    res = await admin.post("/api/admin/announcements", json={"body": body})
    assert res.status_code == 201, res.text
    return res.json()


async def publish(admin: httpx.AsyncClient, id: str) -> dict:
    res = await admin.post(f"/api/admin/announcements/{id}/publish")
    assert res.status_code == 200, res.text
    return res.json()


async def withdraw(admin: httpx.AsyncClient, id: str) -> dict:
    res = await admin.delete(f"/api/admin/announcements/{id}/publish")
    assert res.status_code == 200, res.text
    return res.json()


async def edit(admin: httpx.AsyncClient, id: str, body: str) -> dict:
    res = await admin.put(f"/api/admin/announcements/{id}", json={"body": body})
    assert res.status_code == 200, res.text
    return res.json()


async def listed(admin: httpx.AsyncClient) -> list[dict]:
    res = await admin.get("/api/admin/announcements")
    assert res.status_code == 200, res.text
    return res.json()


async def seen(user: httpx.AsyncClient) -> list[dict]:
    res = await user.get("/api/announcements")
    assert res.status_code == 200, res.text
    return res.json()


async def test_an_announcement_is_written_as_a_draft_users_do_not_see(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)

    draft = await write(admin, "  **新角色**上线了  \n")

    assert draft == {
        "id": draft["id"],
        "body": "**新角色**上线了",
        "status": "draft",
        "published_at": None,
        "created_at": clock().isoformat(),
        "updated_at": clock().isoformat(),
    }
    assert await listed(admin) == [draft]
    res = await admin.get(f"/api/admin/announcements/{draft['id']}")
    assert res.status_code == 200, res.text
    assert res.json() == draft
    assert await seen(user) == []


async def test_a_published_announcement_is_seen_without_who_wrote_it(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)
    draft = await write(admin, "今晚 23 点维护")
    clock.advance(minutes=5)

    published = await publish(admin, draft["id"])

    assert published == draft | {"status": "published", "published_at": clock().isoformat()}
    assert await seen(user) == [
        {"id": draft["id"], "body": "今晚 23 点维护", "published_at": clock().isoformat()}
    ]


async def test_editing_a_published_announcement_keeps_when_it_was_published(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)
    id = (await write(admin, "今晚维护"))["id"]
    published = await publish(admin, id)
    clock.advance(hours=1)

    edited = await edit(admin, id, "今晚 23 点维护")

    assert edited == published | {"body": "今晚 23 点维护", "updated_at": clock().isoformat()}
    assert await seen(user) == [
        {"id": id, "body": "今晚 23 点维护", "published_at": published["published_at"]}
    ]


async def test_withdrawing_and_publishing_again_makes_it_new(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)
    id = (await write(admin, "新角色上线了"))["id"]
    await publish(admin, id)
    clock.advance(hours=1)

    withdrawn = await withdraw(admin, id)

    assert withdrawn["status"] == "draft"
    assert withdrawn["published_at"] is None
    assert await seen(user) == []

    clock.advance(hours=1)
    again = await publish(admin, id)

    assert again["published_at"] == clock().isoformat()
    assert [a["published_at"] for a in await seen(user)] == [clock().isoformat()]


async def test_publishing_or_withdrawing_twice_changes_nothing(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    id = (await write(admin, "新角色上线了"))["id"]
    published = await publish(admin, id)
    clock.advance(hours=1)

    assert await publish(admin, id) == published

    withdrawn = await withdraw(admin, id)
    clock.advance(hours=1)

    assert await withdraw(admin, id) == withdrawn


async def test_a_deleted_announcement_is_gone_for_admins_and_users(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)
    kept = await publish(admin, (await write(admin, "保留"))["id"])
    id = (await write(admin, "删掉"))["id"]
    await publish(admin, id)

    res = await admin.delete(f"/api/admin/announcements/{id}")

    assert res.status_code == 204, res.text
    assert await listed(admin) == [kept]
    assert [a["id"] for a in await seen(user)] == [kept["id"]]
    for res in [
        await admin.get(f"/api/admin/announcements/{id}"),
        await admin.put(f"/api/admin/announcements/{id}", json={"body": "改"}),
        await admin.post(f"/api/admin/announcements/{id}/publish"),
        await admin.delete(f"/api/admin/announcements/{id}/publish"),
        await admin.delete(f"/api/admin/announcements/{id}"),
    ]:
        assert res.status_code == 404, res.text


@pytest.mark.parametrize(
    ("body", "detail"),
    [(" \n ", "公告正文不能为空"), ("字" * 5001, "公告正文最多 5000 字")],
)
async def test_an_empty_or_too_long_body_is_refused(
    make_client: ClientFactory, github: FakeIdentityProvider, body: str, detail: str
):
    admin = await admin_client(make_client, github)
    id = (await write(admin, "原文"))["id"]

    for res in [
        await admin.post("/api/admin/announcements", json={"body": body}),
        await admin.put(f"/api/admin/announcements/{id}", json={"body": body}),
    ]:
        assert res.status_code == 422, res.text
        assert res.json() == {"detail": detail}
    assert [a["body"] for a in await listed(admin)] == ["原文"]


async def test_a_body_of_5000_characters_is_taken(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await admin_client(make_client, github)

    assert (await write(admin, "字" * 5000))["body"] == "字" * 5000


async def test_admins_see_drafts_first_then_the_latest_published(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    first = (await write(admin, "第一条"))["id"]
    clock.advance(minutes=1)
    second = (await write(admin, "第二条"))["id"]
    clock.advance(minutes=1)
    draft = (await write(admin, "草稿"))["id"]
    clock.advance(minutes=1)
    later_draft = (await write(admin, "后写的草稿"))["id"]
    clock.advance(minutes=1)
    await publish(admin, second)
    clock.advance(minutes=1)
    await publish(admin, first)

    assert [a["id"] for a in await listed(admin)] == [later_draft, draft, first, second]


async def test_users_see_the_latest_published_newest_first(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    clock = FakeClock()
    admin = await admin_client(make_client, github, clock=clock)
    user = make_client(FakeLLM(), clock=clock)
    ids = []
    for n in range(SHOWN + 2):
        ids.append((await write(admin, f"第 {n} 条"))["id"])
        await publish(admin, ids[-1])
        clock.advance(minutes=1)
    await write(admin, "草稿")

    assert [a["id"] for a in await seen(user)] == ids[::-1][:SHOWN]


async def test_no_one_but_admins_reaches_the_announcements_in_the_admin_console(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await admin_client(make_client, github)
    id = (await write(admin, "新角色上线了"))["id"]
    user = await github_user(make_client, github, "1001", "octo", "octo@example.com")
    visitor = make_client(FakeLLM(), user=None)

    for client in [user, visitor]:
        for res in [
            await client.get("/api/admin/announcements"),
            await client.post("/api/admin/announcements", json={"body": "我也写"}),
            await client.get(f"/api/admin/announcements/{id}"),
            await client.put(f"/api/admin/announcements/{id}", json={"body": "改"}),
            await client.post(f"/api/admin/announcements/{id}/publish"),
            await client.delete(f"/api/admin/announcements/{id}/publish"),
            await client.delete(f"/api/admin/announcements/{id}"),
        ]:
            assert res.status_code == 404, res.text
    assert [(a["body"], a["status"]) for a in await listed(admin)] == [("新角色上线了", "draft")]


async def test_only_users_who_agreed_to_the_terms_see_announcements(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    newcomer = make_client(FakeLLM(), user=None)
    await sign_in_with(newcomer, github, github_identity("1002", name="new"))

    assert (await newcomer.get("/api/announcements")).status_code == 428
