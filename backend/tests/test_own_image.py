"""Bringing your own image generation (GLOSSARY.md「自带密钥」「生图」): a NovelAI token or a
relay's key, in either format, with its address and model. It is tried by generating one
picture, at the user's own expense and in the deployment's art style, keeping nothing,
counting nothing and recording nothing; a deployment without the judge model, which can
send no photos, refuses it without generating any. A text turn bringing it has her photos
generated on it, one at a time, apart from the deployer's: wherever the deployer has no
image generation, and whatever the user's limit on photos, for they count towards none of
it. One failing on it is not sent, saying it was the user's key, never falling back to the
deployer's, the key masked wherever it is told. Image generation is never one of the
exempting keys. In a public deployment, an own image service is reached only over HTTPS on
the public internet, checked on every connection, a picture's download too.

Driven through the backend's external API, the judge model finding every turn asks for a
photo and the image service, the deployer's and the user's alike, faked at its transport,
told apart by the key each request comes with."""

import asyncio
import logging
import sqlite3
from dataclasses import replace
from pathlib import Path

import pytest

from eidolon.config import ImageSettings, Settings
from eidolon.image_generation import ImageFailed
from eidolon.own_keys import OwnImageService
from eidolon.photo_prompt import check_prompt
from tests.conftest import ClientFactory
from tests.fakes import FakeIdentityProvider, FakeImageService, FakeLLM, FakeLLMService
from tests.test_admin_users import ADMIN, admin_client, find
from tests.test_live_config_limits import LIMITS
from tests.test_own_llm import LLM
from tests.test_photo_failures import ASKED, record_of, until
from tests.test_photos import (  # noqa: F401  (`settings`, with the deployer's image generation)
    IMAGE,
    REPLY,
    WORDS,
    asking,
    photo_events,
    settings,
    settled,
)
from tests.test_text_turn import send_turn, start_conversation
from tests.test_user_limits import set_limits

MY_KEY = "pst-my-own-image-key-7f3a"
MINE = {
    "api_format": "novelai",
    "base_url": "https://my-relay.image.test",
    "api_key": MY_KEY,
    "model": "nai-diffusion-4-5-full",
}
CHECK = "/api/account/keys/image/check"


def keys_of(image: FakeImageService) -> list[str]:
    return [request["key"] for request in image.requests]


def photo_uses(database: Path) -> list[tuple[int]]:
    """Whether each use of a photo recorded is exempt, oldest first."""
    with sqlite3.connect(database) as db:
        return db.execute("SELECT exempt FROM usage WHERE kind = 'photo' ORDER BY rowid").fetchall()


def image_calls(database: Path) -> list[tuple[str, str, int]]:
    """The image service calls recorded: to which provider and model, on whose key."""
    with sqlite3.connect(database) as db:
        return db.execute(
            "SELECT provider, model, own_key FROM service_calls WHERE service = 'image'"
        ).fetchall()


# Trying it before the browser keeps it.


async def test_an_own_image_service_is_tried_by_generating_one_in_the_deployments_style(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    settings = replace(settings, image=replace(IMAGE, style="artist:someone, watercolor"))
    client = make_client(FakeLLM(), settings=settings, image_transport=image.transport())

    tried = await client.post(CHECK, json=MINE | {"base_url": "https://my-relay.image.test/"})

    assert tried.status_code == 200, tried.text
    assert tried.json() == {"base_url": "https://my-relay.image.test", "model": MINE["model"]}
    [request] = image.requests
    assert request["key"] == MY_KEY
    assert request["url"] == "https://my-relay.image.test/ai/generate-image"
    assert request["body"]["model"] == MINE["model"]
    assert request["body"]["input"] == check_prompt("artist:someone, watercolor").positive
    assert image_calls(settings.database_path) == []  # recorded nowhere
    assert photo_uses(settings.database_path) == []  # counted nowhere


async def test_an_own_image_service_in_openais_format_is_tried_there(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    client = make_client(FakeLLM(), image_transport=image.transport())
    mine = MINE | {"api_format": "openai", "base_url": "https://my-relay.image.test/v1"}

    tried = await client.post(CHECK, json=mine)

    assert tried.status_code == 200, tried.text
    assert [r["url"] for r in image.requests] == [
        "https://my-relay.image.test/v1/images/generations"
    ]


async def test_an_own_image_service_that_fails_its_try_is_refused_its_key_masked(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    image.status, image.error = 401, f"invalid token {MY_KEY}"
    client = make_client(FakeLLM(), image_transport=image.transport())

    tried = await client.post(CHECK, json=MINE)

    assert tried.status_code == 422
    detail = tried.json()["detail"]
    assert detail.startswith("试调失败：生图服务返回 401")
    assert MY_KEY not in detail and "invalid token ***" in detail


async def test_a_deployment_without_the_judge_model_refuses_an_own_image_service_untried(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    client = make_client(
        FakeLLM(), settings=replace(settings, judge=None), image_transport=image.transport()
    )

    tried = await client.post(CHECK, json=MINE)

    assert tried.status_code == 422
    assert tried.json()["detail"] == "试调失败：这个部署发不了照片"
    assert image.requests == []


# Her photos on it.


async def test_a_turn_bringing_one_has_her_photo_on_it_counting_towards_nothing(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    settings = replace(settings, image=replace(IMAGE, style="watercolor"))
    client = make_client(
        FakeLLM(REPLY), settings=settings, clients=asking(), image_transport=image.transport()
    )
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED, own_keys={"image": MINE}))
    settled_photo = await settled(client, photo["id"])

    assert settled_photo["status"] == "ready"
    [request] = image.requests
    assert request["key"] == MY_KEY
    assert request["url"] == "https://my-relay.image.test/ai/generate-image"
    assert request["body"]["model"] == MINE["model"]
    assert "watercolor" in request["body"]["input"]  # the deployment's art style
    assert photo_uses(settings.database_path) == [(1,)]  # recorded, exempt
    assert image_calls(settings.database_path) == [("own", "own", 1)]


async def test_a_deployment_without_image_generation_sends_photos_on_the_users_own(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    client = make_client(
        FakeLLM(REPLY, REPLY), settings=replace(settings, image=None), clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(client)

    without = await send_turn(client, conversation, ASKED)
    [photo] = photo_events(await send_turn(client, conversation, ASKED, own_keys={"image": MINE}))

    assert photo_events(without) == []
    assert (await settled(client, photo["id"]))["status"] == "ready"
    assert keys_of(image) == [MY_KEY]


async def test_a_user_whose_photos_are_set_to_0_still_has_them_on_their_own(
    make_client: ClientFactory, settings: Settings, github: FakeIdentityProvider
):
    settings = replace(settings, admins=frozenset({ADMIN}))
    admin = await admin_client(make_client, github, settings=settings)
    image = FakeImageService()
    producer = make_client(
        FakeLLM(REPLY, REPLY), settings=settings, clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(producer)
    await set_limits(admin, (await find(admin, "producer"))["id"], photos_per_hour=0)

    without = await send_turn(producer, conversation, ASKED)
    on_own = await send_turn(producer, conversation, ASKED, own_keys={"image": MINE})

    assert photo_events(without) == []
    assert len(photo_events(on_own)) == 1
    await until(lambda: image.requests)
    assert keys_of(image) == [MY_KEY]


async def test_photos_on_the_users_own_wait_for_each_other_and_not_for_the_deployers(
    make_client: ClientFactory, settings: Settings
):
    image = FakeImageService()
    image.gate = asyncio.Event()
    settings = replace(settings, image=replace(IMAGE, concurrency=1))
    client = make_client(
        FakeLLM(REPLY, REPLY, REPLY), settings=settings, clients=asking(),
        image_transport=image.transport(),
    )
    conversation = await start_conversation(client)

    photos = [
        photo_events(await send_turn(client, conversation, ASKED, own_keys=own))[0]["id"]
        for own in [{"image": MINE}, {"image": MINE}, None]
    ]
    await until(lambda: len(image.requests) == 2)
    await asyncio.sleep(0.05)
    waiting = keys_of(image)
    image.gate.set()
    for photo in photos:
        assert (await settled(client, photo))["status"] == "ready"

    assert sorted(waiting) == sorted([MY_KEY, IMAGE.api_key])  # one of the user's at a time
    assert sorted(keys_of(image)) == sorted([MY_KEY, MY_KEY, IMAGE.api_key])


async def test_one_failing_on_the_users_own_says_so_never_on_the_deployers_its_key_masked(
    make_client: ClientFactory, settings: Settings, caplog: pytest.LogCaptureFixture
):
    caplog.set_level(logging.DEBUG)
    image = FakeImageService()
    image.status, image.error = 401, f"invalid token {MY_KEY}"
    client = make_client(FakeLLM(REPLY), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED, own_keys={"image": MINE}))
    settled_photo = await settled(client, photo["id"])
    record = await record_of(client, conversation)

    assert settled_photo == {"status": "failed", "reason": "own_key_failed"}
    assert record[-1]["photo"]["status"] == "failed"
    assert keys_of(image) == [MY_KEY]  # never again on the deployer's
    assert photo_uses(settings.database_path) == []  # given back
    assert MY_KEY not in caplog.text
    assert "invalid token ***" in caplog.text


async def test_a_turn_on_the_users_own_llm_without_their_own_image_still_counts_her_photo(
    make_client: ClientFactory, settings: Settings, own_llm: FakeLLMService
):
    own_llm.llm = FakeLLM(REPLY)
    image = FakeImageService()
    client = make_client(FakeLLM(), clients=asking(), image_transport=image.transport())
    conversation = await start_conversation(client)

    [photo] = photo_events(await send_turn(client, conversation, ASKED, own_llm=LLM))
    await settled(client, photo["id"])

    assert keys_of(image) == [IMAGE.api_key]
    assert photo_uses(settings.database_path) == [(0,)]


# Never one of the exempting keys.


async def test_image_generation_is_never_one_of_the_exempting_keys(
    make_client: ClientFactory, settings: Settings, github: FakeIdentityProvider,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("EIDOLON_EXEMPTING_IMAGE", "1")
    client = make_client(FakeLLM())
    admin = await admin_client(
        make_client, github, settings=replace(settings, admins=frozenset({ADMIN}))
    )

    account = (await client.get("/api/account")).json()
    alone = (await client.get("/api/account/keys/exemption", params={"own": "image"})).json()
    limits = (await admin.get("/api/admin/config")).json()["limits"]["env"]
    saved = await admin.put(LIMITS, json=limits | {"exempting_image": True})

    assert account["exempting_keys"] == ["llm", "tts", "stt"]
    assert alone == {"turns": False, "calls": False}
    assert [f for f in limits if f.startswith("exempting_")] == [
        "exempting_llm", "exempting_tts", "exempting_stt",
    ]
    assert "exempting_image" not in saved.json()["limits"]["effective"]


# Only over HTTPS on the public internet, in a public deployment.


async def own_image_fails(service: OwnImageService, own: ImageSettings) -> ImageFailed:
    """Why a photo on the user's own image service `own` was not generated."""
    generator = service.generator(own)
    with pytest.raises(ImageFailed) as failed:
        await generator.generate(check_prompt(""), asyncio.get_running_loop().time() + 10)
    return failed.value


@pytest.mark.parametrize("base_url", ["http://image.example.com", "https://10.0.0.8/v1"])
async def test_a_public_deployment_tries_only_image_services_on_the_public_internet(
    base_url: str,
):
    service = OwnImageService(public_only=True)
    try:
        with pytest.raises(ImageFailed, match="https|公网地址"):
            await service.check(ImageSettings(MY_KEY, base_url))
        failed = await own_image_fails(service, ImageSettings(MY_KEY, base_url))
    finally:
        await service.aclose()

    assert "https" in failed.detail or "公网地址" in failed.detail

