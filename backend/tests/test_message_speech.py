"""Her replies said aloud: voiced on demand, and kept so that asking again voices nothing."""

import httpx

from tests.conftest import ClientFactory
from tests.fakes import DEPLOYER_FISH_KEY, FakeLLM, FakeSpeech
from tests.test_text_turn import send_turn, start_conversation

REPLY = "<ja>ほわっ、聞こえてる？</ja><zh>哇，听得到吗？</zh>"


async def her_latest_reply(client: httpx.AsyncClient, conversation_id: str) -> int:
    """The id of her latest reply in the conversation."""
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    hers = [entry for entry in record if entry["role"] == "character"]
    return hers[-1]["id"]


async def test_a_reply_is_voiced_when_asked_and_kept(
    make_client: ClientFactory, speech: FakeSpeech
):
    client = make_client(FakeLLM([REPLY]))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    reply_id = await her_latest_reply(client, conversation_id)

    first = await client.get(f"/api/messages/{reply_id}/speech")

    assert first.status_code == 200
    assert first.headers["content-type"] == "audio/mpeg"
    assert first.content == FakeSpeech.SPOKEN
    key, _, voice_id, said = speech.spoken[-1]
    assert key == DEPLOYER_FISH_KEY
    assert said.strip()  # what she said, delivery cues and all taken off
    assert voice_id  # in her voice

    again = await client.get(f"/api/messages/{reply_id}/speech")

    assert again.content == first.content
    assert len(speech.spoken) == 1  # voiced once; the second ask played what was kept


async def test_without_a_voice_it_says_so(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]), voice_configured=False)
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    reply_id = await her_latest_reply(client, conversation_id)

    res = await client.get(f"/api/messages/{reply_id}/speech")

    assert res.status_code == 503
    assert "语音合成" in res.json()["detail"]


async def test_a_failing_service_is_reported(make_client: ClientFactory, speech: FakeSpeech):
    speech.rejects[DEPLOYER_FISH_KEY] = "Fish Audio 连不上"
    client = make_client(FakeLLM([REPLY]))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    reply_id = await her_latest_reply(client, conversation_id)

    res = await client.get(f"/api/messages/{reply_id}/speech")

    assert res.status_code == 502
    assert "语音合成失败了" in res.json()["detail"]


async def test_only_her_replies_are_spoken(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    mine = [entry for entry in record if entry["role"] == "user"]

    assert (await client.get(f"/api/messages/{mine[-1]['id']}/speech")).status_code == 404


async def test_another_users_reply_is_not_spoken(make_client: ClientFactory):
    client = make_client(FakeLLM([REPLY]))
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "聞こえる？")
    reply_id = await her_latest_reply(client, conversation_id)

    other: httpx.AsyncClient = make_client(FakeLLM(), user="someone-else")

    assert (await other.get(f"/api/messages/{reply_id}/speech")).status_code == 404
