"""Image generation in the activity records (GLOSSARY.md「生图」「运行记录」): every request
sent to the image service is a service call to `image`, recorded under the turn the photo
was begun in, however long after the turn it comes; billed one picture where one came
back, the wrong size or not, none where the service failed or took too long, with what
kind of failure it was. The dashboard prices pictures each, NovelAI's V5 Curated at its
preset, a relay's as an admin sets it. Driven through the backend's external API, the
image service faked at its transport."""

import asyncio
import sqlite3
from dataclasses import replace
from pathlib import Path

import pytest

import eidolon.photos
from eidolon.config import ImageSettings, Settings
from tests.conftest import ClientFactory
from tests.fakes import (
    FAKE_JUDGE,
    FakeClock,
    FakeIdentityProvider,
    FakeImageService,
    FakeLLM,
    OpenAIAnswer,
)
from tests.test_activity_records import admin_client, dashboard, health
from tests.test_cost_estimate import listed, row
from tests.test_photos import IMAGE, REPLY, asking, photo_events, settled
from tests.test_text_turn import send_turn, start_conversation


@pytest.fixture
def settings(settings: Settings) -> Settings:
    """With the deployer's image generation and the judge model, affinity off; the GitHub
    user 1001 is an admin."""
    return replace(
        settings, image=IMAGE, judge=FAKE_JUDGE, affinity_and_gifts=False,
        admins=frozenset({("github", "1001")}),
    )


def calls_by_record(database: Path) -> dict[str, list[int | None]]:
    """The records each service's calls were made under, by service, oldest first."""
    with sqlite3.connect(database) as db:
        rows = db.execute("SELECT service, record_id FROM service_calls ORDER BY id").fetchall()
    calls: dict[str, list[int | None]] = {}
    for service, record_id in rows:
        calls.setdefault(service, []).append(record_id)
    return calls


def turn_records(database: Path) -> list[int]:
    with sqlite3.connect(database) as db:
        return [i for (i,) in db.execute("SELECT id FROM activity_records WHERE kind = 'turn'")]


async def test_a_photo_is_a_call_under_its_turn_billed_one_picture_though_the_turn_is_over(
    make_client: ClientFactory, settings: Settings, github: FakeIdentityProvider
):
    clock = FakeClock()
    image = FakeImageService()
    image.gate = asyncio.Event()
    client = make_client(
        FakeLLM(REPLY), clients=asking(), clock=clock, image_transport=image.transport()
    )
    admin = await admin_client(make_client, github, clock)
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, "发张自拍给我看看"))
    [turn] = turn_records(settings.database_path)
    before = calls_by_record(settings.database_path)
    image.gate.set()
    await settled(client, photo["id"])
    after = calls_by_record(settings.database_path)
    board = await dashboard(admin)

    assert "image" not in before
    assert after["chat_llm"] == [turn]
    assert after["image"] == [turn]
    image_row = health(board, "image")
    assert image_row is not None
    assert (image_row["calls"], image_row["errors"]) == (1, 0)
    assert image_row["usage"] == [{"unit": "images", "input": 1, "output": None}]
    assert image_row["usage_unknown"] == 0


@pytest.mark.parametrize(
    ("answered", "error", "pictures"),
    [
        ("HTTP 500", "server_error", 0),
        ("HTTP 401", "unauthorized", 0),
        ("too slow", "timeout", 0),
        ("the wrong size", "unreadable", 1),
    ],
)
async def test_a_failed_generation_is_a_call_saying_why_billed_only_a_picture_that_came(
    make_client: ClientFactory,
    github: FakeIdentityProvider,
    monkeypatch: pytest.MonkeyPatch,
    answered: str,
    error: str,
    pictures: int,
):
    clock = FakeClock()
    image = FakeImageService()
    if answered.startswith("HTTP"):
        image.status = int(answered.removeprefix("HTTP "))
    if answered == "too slow":
        monkeypatch.setattr(eidolon.photos, "TIME_LIMIT", 0.2)
        image.gate = asyncio.Event()  # never opened
    if answered == "the wrong size":
        image.size = (1024, 1024)
    client = make_client(
        FakeLLM(REPLY), clients=asking(), clock=clock, image_transport=image.transport()
    )
    admin = await admin_client(make_client, github, clock)
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, "发张自拍给我看看"))
    await settled(client, photo["id"])
    board = await dashboard(admin)

    image_row = health(board, "image")
    assert image_row is not None
    assert (image_row["calls"], image_row["errors"]) == (1, 1)
    assert image_row["errors_by_kind"] == {error: 1}
    assert image_row["usage"] == [{"unit": "images", "input": pictures, "output": None}]
    assert "fake image service error" not in str(board)


@pytest.mark.parametrize("answer", ["not_base64", "url"])
async def test_in_openais_image_format_a_picture_not_had_is_billed_none(
    make_client: ClientFactory,
    settings: Settings,
    github: FakeIdentityProvider,
    answer: OpenAIAnswer,
):
    clock = FakeClock()
    relay = ImageSettings(
        "relay-key", "https://relay.image.test/v1", "nai-diffusion-4-5-full",
        api_format="openai",
    )
    image = FakeImageService()
    image.openai_answer = answer
    image.download_status = 502
    client = make_client(
        FakeLLM(REPLY), clients=asking(), settings=replace(settings, image=relay),
        clock=clock, image_transport=image.transport(),
    )
    admin = await admin_client(make_client, github, clock)
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, "发张自拍给我看看"))
    came_out = await settled(client, photo["id"])
    image_row = health(await dashboard(admin), "image")

    assert came_out["status"] == "failed", answer
    assert image_row is not None
    assert image_row["usage"] == [{"unit": "images", "input": 0, "output": None}], answer


async def test_novelais_v5_curated_is_priced_at_its_preset_by_the_picture(
    make_client: ClientFactory, settings: Settings, github: FakeIdentityProvider
):
    clock = FakeClock()
    official = replace(settings, image=ImageSettings("nai-key", "https://image.novelai.net"))
    image = FakeImageService()
    client = make_client(
        FakeLLM(REPLY, REPLY), clients=asking(), settings=official, clock=clock,
        image_transport=image.transport(),
    )
    admin = await admin_client(make_client, github, clock)
    conversation = await start_conversation(client)

    for _ in range(2):
        [photo] = photo_events(await send_turn(client, conversation, "发张自拍给我看看"))
        await settled(client, photo["id"])
    cost = (await dashboard(admin))["cost"]

    priced = row({"cost": cost}, "image.novelai.net", "nai-diffusion-5-curated")
    assert (priced["service"], priced["unit"], priced["calls"], priced["input"]) == (
        "image", "images", 2, 2
    )
    assert priced["price"] == {
        "input": 0.036, "output": None, "cache_read": None, "currency": "USD", "per": 1,
        "as_of": "2026-10-17", "source": "preset",
    }
    assert priced["amount"] == pytest.approx(0.072)
    *_, last = cost["services"]  # image generation comes last, as in the health table
    assert last == {
        "service": "image", "totals": [{"currency": "USD", "amount": pytest.approx(0.072)}],
        "unpriced": 0, "usage_unknown": 0,
    }


async def test_a_relays_pictures_are_unpriced_until_an_admin_prices_them_each(
    make_client: ClientFactory, settings: Settings, github: FakeIdentityProvider
):
    clock = FakeClock()
    image = FakeImageService()
    client = make_client(
        FakeLLM(REPLY), clients=asking(), clock=clock, image_transport=image.transport()
    )
    admin = await admin_client(make_client, github, clock)
    [photo] = photo_events(
        await send_turn(client, await start_conversation(client), "发张自拍给我看看")
    )
    await settled(client, photo["id"])
    key = {"provider": "image.novelai.test", "model": "nai-diffusion-5-curated", "unit": "images"}

    unpriced = (await admin.get("/api/admin/prices")).json()["unpriced"]
    before = row(await dashboard(admin), "image.novelai.test", "nai-diffusion-5-curated")
    saved = await admin.put(
        "/api/admin/prices", json=key | {"input": 0.05, "output": None, "currency": "USD"}
    )
    after = row(await dashboard(admin), "image.novelai.test", "nai-diffusion-5-curated")

    assert unpriced == [{"service": "image"} | key]
    assert (before["input"], before["price"], before["amount"]) == (1, None, None)
    assert saved.status_code == 200, saved.text
    entry = listed(saved.json(), "image.novelai.test", "nai-diffusion-5-curated")
    assert entry is not None and entry["override"]["per"] == 1
    assert after["amount"] == pytest.approx(0.05)
