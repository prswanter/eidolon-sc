"""Deleting a user in the admin console: the same as the user deleting themselves, all
their data gone for good and their calls hung up. A banned user deleted stays banned:
the identities they signed in with are kept on the ban list, as keyed hashes, and can
neither sign in nor be linked again; anyone else deleted may sign up afresh. No admin can
be deleted there."""

from dataclasses import replace

import pytest

from eidolon.config import Settings
from tests.browser import Browser
from tests.conftest import (
    ClientFactory,
    agree_to_terms,
    github_identity,
    google_identity,
    sign_in_with,
)
from tests.fakes import FakeIdentityProvider, FakeLLM, FakeSpeech
from tests.test_admin_users import admin_client, find
from tests.test_admin_users import settings  # noqa: F401  (with an admin)
from tests.test_delete_account import (
    memory_client,
    rows_mentioning,
    use_everything,
    user_id,
)
from tests.test_text_turn import start_conversation


async def test_deleting_a_user_leaves_nothing_of_theirs_and_hangs_up_their_call(
    make_client: ClientFactory,
    settings: Settings,
    github: FakeIdentityProvider,
    speech: FakeSpeech,
    browser: Browser,
):
    admin = await admin_client(make_client, github)
    producer = memory_client(make_client)
    await use_everything(producer)
    producer_id = user_id(settings.database_path, "producer")
    await browser.call(producer, conversation_id=await start_conversation(producer))
    await browser.connect()

    res = await admin.delete(f"/api/admin/users/{producer_id}")

    assert res.status_code == 204, res.text
    await browser.hung_up()
    assert rows_mentioning(settings.database_path, producer_id) == {}
    assert (await producer.get("/api/account")).status_code == 401
    assert (await admin.get(f"/api/admin/users/{producer_id}")).status_code == 404
    assert (await admin.delete(f"/api/admin/users/{producer_id}")).status_code == 404


@pytest.mark.parametrize("secret_key", ["test-secret-key", None], ids=["keyed", "unkeyed"])
async def test_a_banned_user_deleted_cannot_sign_in_or_be_linked_with_their_identities_again(
    make_client: ClientFactory,
    settings: Settings,
    github: FakeIdentityProvider,
    google: FakeIdentityProvider,
    secret_key: str | None,
):
    settings = replace(settings, secret_key=secret_key)
    admin = await admin_client(make_client, github, settings=settings)
    octo = make_client(FakeLLM(), user=None, settings=settings)
    await sign_in_with(octo, github, github_identity("1001", name="octo"))
    await agree_to_terms(octo)
    await sign_in_with(octo, google, google_identity("g-1001"), link=True)
    octo_id = (await find(admin, "octo"))["id"]
    await admin.post(f"/api/admin/users/{octo_id}/ban", json={"note": "刷量"})

    assert (await admin.delete(f"/api/admin/users/{octo_id}")).status_code == 204

    for provider, identity in [(github, github_identity("1001", name="octo")),
                               (google, google_identity("g-1001"))]:
        refused = await sign_in_with(octo, provider, identity)
        assert refused.headers["location"] == "/login?error=banned", provider.name
    other = make_client(FakeLLM(), user=None, settings=settings)
    await sign_in_with(other, github, github_identity("2002", name="other"))
    await agree_to_terms(other)
    linking = await sign_in_with(other, google, google_identity("g-1001"), link=True)
    assert linking.headers["location"] == "/settings/sign-in?error=banned"
    assert [u["name"] for u in (await admin.get("/api/admin/users")).json()["users"]] == [
        "other", "boss",
    ]
    for kept in ("1001", "g-1001", "octo"):  # only as hashes
        assert rows_mentioning(settings.database_path, kept) == {}, kept


async def test_a_user_deleted_without_a_ban_may_sign_up_again(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await admin_client(make_client, github)
    octo = make_client(FakeLLM(), user=None)
    await sign_in_with(octo, github, github_identity("1001", name="octo"))
    await agree_to_terms(octo)
    old_id = (await find(admin, "octo"))["id"]

    await admin.delete(f"/api/admin/users/{old_id}")
    welcome = await sign_in_with(octo, github, github_identity("1001", name="octo"))

    assert welcome.headers["location"] == "/conversations"
    assert (await find(admin, "octo"))["id"] != old_id


async def test_no_admin_can_be_deleted_in_the_admin_console_not_even_oneself(
    make_client: ClientFactory, github: FakeIdentityProvider
):
    admin = await admin_client(make_client, github)
    boss = await find(admin, "boss")

    res = await admin.delete(f"/api/admin/users/{boss['id']}")

    assert res.status_code == 409
    assert "管理者" in res.json()["detail"]
    assert (await admin.get("/api/admin")).status_code == 200
