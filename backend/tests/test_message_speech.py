"""Her replies said aloud: voiced on demand, on the keys a call would use, and kept so that
asking again voices nothing."""

import httpx

from tests.conftest import ClientFactory
from tests.fakes import DEPLOYER_FISH_KEY, FakeLLM, FakeSpeech
from tests.test_text_turn import send_turn, start_conversation

REPLY = "<ja>ほわっ、聞こえてる？</ja><zh>哇，听得到吗？</zh>"

MY_FISH = "fish-my-own-key-aaaa"
MY_FISH_MODEL = "drama-3"


async def speak(
    client: httpx.AsyncClient, message_id: int, own_keys: dict | None = None
) -> httpx.Response:
    """Ask for `message_id` to be said aloud, bringing `own_keys` as a browser does."""
    return await client.post(f"/api/messages/{message_id}/speech", json={"own_keys": own_keys})


async def her_latest_reply(client: httpx.AsyncClient, conversation_id: str) -> int:
    """The id of her latest reply in the conversation."""
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    hers = [entry for entry in record if entry["role"] == "character"]
    return hers[-1]["id"]


async def a_reply_to_read_aloud(client: httpx.AsyncClient) -> int:
    """Start a conversation with a client and have her reply once; that reply's id."""
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    return await her_latest_reply(client, conversation_id)


async def test_a_reply_is_voiced_when_asked_and_kept(
    make_client: ClientFactory, speech: FakeSpeech
):
    client = make_client(FakeLLM([REPLY]))
    reply_id = await a_reply_to_read_aloud(client)

    first = await speak(client, reply_id)

    assert first.status_code == 200
    assert first.headers["content-type"] == "audio/mpeg"
    assert first.content == FakeSpeech.SPOKEN
    key, model, voice_id, said = speech.spoken[-1]
    assert key == DEPLOYER_FISH_KEY  # nothing brought: the deployer's, as a call with none
    assert model  # with the deployer's model
    assert said.strip()  # what she said, delivery cues and all taken off
    assert voice_id  # in her voice

    again = await speak(client, reply_id)

    assert again.content == first.content
    assert len(speech.spoken) == 1  # voiced once; the second ask played what was kept


async def test_the_users_own_key_voices_it_as_a_call_would(
    make_client: ClientFactory, speech: FakeSpeech
):
    client = make_client(FakeLLM([REPLY]))
    reply_id = await a_reply_to_read_aloud(client)

    res = await speak(client, reply_id, {"tts": {"api_key": MY_FISH, "model": MY_FISH_MODEL}})

    assert res.status_code == 200
    key, model, _, _ = speech.spoken[-1]
    assert (key, model) == (MY_FISH, MY_FISH_MODEL)  # theirs, and the model they chose


async def test_the_users_own_key_voices_it_without_the_deployers(
    make_client: ClientFactory, speech: FakeSpeech
):
    client = make_client(FakeLLM([REPLY]), voice_configured=False)
    reply_id = await a_reply_to_read_aloud(client)

    assert (await speak(client, reply_id)).status_code == 503  # the deployer has no key

    res = await speak(client, reply_id, {"tts": {"api_key": MY_FISH}})

    assert res.status_code == 200
    assert speech.spoken[-1][0] == MY_FISH


async def test_a_failing_own_key_is_reported_masked_and_does_not_fall_back(
    make_client: ClientFactory, speech: FakeSpeech
):
    speech.rejects[MY_FISH] = f"Fish Audio 不认这个 key：{MY_FISH}"
    client = make_client(FakeLLM([REPLY]))
    reply_id = await a_reply_to_read_aloud(client)

    res = await speak(client, reply_id, {"tts": {"api_key": MY_FISH}})

    assert res.status_code == 502
    detail = res.json()["detail"]
    assert "自带的密钥" in detail  # whose key it was
    assert MY_FISH not in detail  # masked
    assert [key for key, *_ in speech.spoken] == [MY_FISH]  # never the deployer's


async def test_without_a_voice_it_says_so(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]), voice_configured=False)
    reply_id = await a_reply_to_read_aloud(client)

    res = await speak(client, reply_id)

    assert res.status_code == 503
    assert "语音合成" in res.json()["detail"]


async def test_a_failing_service_is_reported(make_client: ClientFactory, speech: FakeSpeech):
    speech.rejects[DEPLOYER_FISH_KEY] = "Fish Audio 连不上"
    client = make_client(FakeLLM([REPLY]))
    reply_id = await a_reply_to_read_aloud(client)

    res = await speak(client, reply_id)

    assert res.status_code == 502
    assert "语音合成失败了" in res.json()["detail"]


async def test_only_her_replies_are_spoken(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    mine = [entry for entry in record if entry["role"] == "user"]

    assert (await speak(client, mine[-1]["id"])).status_code == 404


async def test_another_users_reply_is_not_spoken(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]))
    reply_id = await a_reply_to_read_aloud(client)

    other: httpx.AsyncClient = make_client(FakeLLM(), user="someone-else")

    assert (await speak(other, reply_id)).status_code == 404
