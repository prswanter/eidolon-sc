"""A photo not sent (GLOSSARY.md「照片」): where the image service takes too long, fails, or
answers with what is not one picture of the size asked for, her words are recorded as
ever and the photo with them as not sent, saying why, still so once the page is reloaded;
from then on her prompt carries its tag marked failed, and tells her what that means.
Photos on the deployer's image service wait their turn, first come first served, one at a
time; none takes longer than its time limit from her tag on, waiting included, and one
that waited all of it was never sent. A photo whose reply is never recorded, or is gone
by the time it comes out, is not kept; one whose conversation is merely no longer her
current one is. A photo still being generated when the server stopped is not sent.

Driven through the backend's external API, the image service faked at its transport, its
time limit shortened where the tests need it to run out."""

import asyncio
from collections.abc import Callable

import httpx
import pytest

import eidolon.photos
from eidolon.config import Settings
from eidolon.photos import NOT_RECEIVED
from tests.conftest import ClientFactory
from tests.fakes import HANG, FakeImageService, FakeLLM, context_of
from tests.test_conversation_events import hang_up
from tests.test_delete_account import DELETE, rows_mentioning
from tests.test_live_config import recorded
from tests.test_photos import (  # noqa: F401  (`settings`, with the deployer's image generation)
    REPLY,
    SELFIE,
    WORDS,
    asking,
    photo_events,
    settings,
    settled,
)
from tests.test_text_turn import leave_turn, send_turn, start_conversation

ASKED = "发张自拍给我看看"


def tagged(outfit: str) -> list[str]:
    """Her reply with a selfie in `outfit`."""
    return [f"<photo>{SELFIE.replace('white shirt, cardigan', outfit)}</photo>", WORDS]


async def until(done: Callable[[], object]) -> None:
    for _ in range(200):
        if done():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("never came true")


async def record_of(client: httpx.AsyncClient, conversation: str) -> list[dict]:
    """The conversation's record, as the page reads it once reloaded."""
    res = await client.get(f"/api/conversations/{conversation}/messages")
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.parametrize(
    ("answered", "reason"),
    [
        ("too slow", "timeout"),
        ("HTTP 503", "service_error"),
        ("the wrong size", "bad_image"),
        ("not a ZIP", "bad_image"),
    ],
)
async def test_a_photo_not_had_is_kept_as_not_sent_saying_why_beside_her_words(
    make_client: ClientFactory, monkeypatch: pytest.MonkeyPatch, answered: str, reason: str
):
    image = FakeImageService()
    if answered == "too slow":
        monkeypatch.setattr(eidolon.photos, "TIME_LIMIT", 0.2)
        image.gate = asyncio.Event()
    if answered == "HTTP 503":
        image.status = 503
    if answered == "the wrong size":
        image.size = (1216, 832)
    if answered == "not a ZIP":
        image.garbled = True
    client = make_client(FakeLLM(REPLY), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    events = await send_turn(client, conversation, ASKED)
    [photo] = photo_events(events)
    failed = await settled(client, photo["id"])
    if image.gate is not None:  # what comes after the time limit is left
        image.gate.set()
        await asyncio.sleep(0.05)
    [_, reply] = await record_of(client, conversation)

    assert failed == {"status": "failed", "reason": reason}
    assert reply["photo"] == {"id": photo["id"], "status": "failed", "reason": reason}
    assert (reply["ja"], reply["zh"]) == ("はい、どうぞ", "给，你看")
    assert (await client.get(f"/api/photos/{photo['id']}/image")).status_code == 404
    assert len(image.requests) == 1  # never asked again


async def test_her_later_turns_carry_a_photo_not_sent_marked_failed_and_she_is_told_so(
    make_client: ClientFactory,
):
    image = FakeImageService()
    image.status = 500
    llm = FakeLLM(REPLY, [WORDS], [WORDS])
    client = make_client(llm, clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED))
    await settled(client, photo["id"])
    await send_turn(client, conversation, "照片呢？")

    first, later = llm.prompts[0], llm.prompts[1]
    replies = [m.content for m in later if m.role == "assistant"]
    assert replies == [f'<photo status="failed">{SELFIE}</photo>{WORDS}']
    assert NOT_RECEIVED in context_of(later)
    assert NOT_RECEIVED not in context_of(first)


async def test_a_photo_sent_or_still_being_generated_carries_no_mark(make_client: ClientFactory):
    image = FakeImageService()
    image.gate = asyncio.Event()
    llm = FakeLLM(REPLY, [WORDS])
    client = make_client(llm, clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    await send_turn(client, conversation, ASKED)
    await send_turn(client, conversation, "还没好吗")

    replies = [m.content for m in llm.prompts[1] if m.role == "assistant"]
    assert replies == [f"<photo>{SELFIE}</photo>{WORDS}"]
    assert NOT_RECEIVED not in context_of(llm.prompts[1])
    image.gate.set()


async def test_photos_wait_their_turn_one_at_a_time_first_come_first_served(
    make_client: ClientFactory,
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    outfits = ["red dress", "school uniform", "hoodie"]
    client = make_client(
        FakeLLM(*(tagged(o) for o in outfits)), clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(client)

    photos = []
    for _ in outfits:
        [photo] = photo_events(await send_turn(client, conversation, ASKED))
        photos.append(photo["id"])
    await asyncio.sleep(0.05)
    waiting = len(image.requests)
    image.gate.set()
    came_out = [await settled(client, p) for p in photos]

    assert waiting == 1
    assert came_out == [{"status": "ready", "reason": None}] * 3
    for request, outfit in zip(image.requests, outfits, strict=True):
        assert outfit in request["body"]["input"]


async def test_one_that_waits_out_its_time_limit_is_never_sent_nor_recorded_as_a_call(
    make_client: ClientFactory, monkeypatch: pytest.MonkeyPatch
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    client = make_client(
        FakeLLM(tagged("red dress"), tagged("hoodie")), clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(client)

    [first] = photo_events(await send_turn(client, conversation, ASKED))
    monkeypatch.setattr(eidolon.photos, "TIME_LIMIT", 0.2)
    [waited] = photo_events(await send_turn(client, conversation, ASKED))
    waited_out = await settled(client, waited["id"])
    image.gate.set()
    sent = await settled(client, first["id"])

    assert waited_out == {"status": "failed", "reason": "timeout"}
    assert sent == {"status": "ready", "reason": None}
    [request] = image.requests
    assert "red dress" in request["body"]["input"]
    assert len(recorded(client, "image")) == 1


async def test_one_whose_reply_is_never_recorded_is_not_kept(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    client = make_client(
        FakeLLM([f"<photo>{SELFIE}</photo>", HANG]), clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(client)

    events = await leave_turn(client, conversation, ASKED, after="photo")
    [photo] = photo_events(events)
    image.gate.set()
    await until(lambda: recorded(client, "image"))
    await asyncio.sleep(0.05)

    assert await record_of(client, conversation) == []
    assert (await client.get(f"/api/photos/{photo['id']}")).status_code == 404
    assert rows_mentioning(settings.database_path, photo["id"]) == {}


@pytest.mark.parametrize("gone", ["past conversation deleted", "user deleted"])
async def test_one_whose_reply_is_gone_by_the_time_it_comes_out_is_not_kept(
    make_client: ClientFactory, settings: Settings, gone: str
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    client = make_client(FakeLLM(REPLY), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED))
    if gone == "past conversation deleted":
        hang_up(settings.database_path, conversation)
        assert await start_conversation(client) != conversation
        assert (await client.delete(f"/api/conversations/{conversation}")).status_code == 204
    else:
        assert (await client.post("/api/account/delete", json=DELETE)).status_code == 204
    image.gate.set()
    await until(lambda: recorded(client, "image"))
    await asyncio.sleep(0.05)

    assert rows_mentioning(settings.database_path, photo["id"]) == {}


async def test_one_whose_conversation_is_no_longer_her_current_one_is_kept_all_the_same(
    make_client: ClientFactory,
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    client = make_client(FakeLLM(REPLY), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED))
    assert await start_conversation(client) != conversation
    image.gate.set()
    sent = await settled(client, photo["id"])
    [_, reply] = await record_of(client, conversation)

    assert sent == {"status": "ready", "reason": None}
    assert reply["photo"]["status"] == "ready"


async def test_one_still_being_generated_when_the_server_stopped_took_too_long(
    make_client: ClientFactory,
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    before = make_client(FakeLLM(REPLY), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(before)
    [photo] = photo_events(await send_turn(before, conversation, ASKED))

    after = make_client(FakeLLM(), image_transport=FakeImageService().transport())
    status = (await after.get(f"/api/photos/{photo['id']}")).json()
    [_, reply] = await record_of(after, conversation)

    assert status == {"status": "failed", "reason": "timeout"}
    assert reply["photo"] == {"id": photo["id"], "status": "failed", "reason": "timeout"}
