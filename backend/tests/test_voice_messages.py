"""Voice messages: the composer's recording, heard on the deployer's speech recognition."""

import httpx
import pytest

from eidolon.call import SpeechServices
from eidolon.config import SttKey
from tests.conftest import ClientFactory
from tests.fakes import DEPLOYER_SONIOX_KEY, FakeLLM, FakeSpeech

PCM = b"\x00\x01" * 1600
"""A tenth of a second of 16 kHz 16-bit mono silence, as the composer sends it."""


async def test_voice_message_is_heard_as_text(make_client: ClientFactory, speech: FakeSpeech):
    speech.heard = "今天也辛苦了"
    client = make_client(FakeLLM())

    res = await client.post(
        "/api/voice", content=PCM, headers={"content-type": "application/octet-stream"}
    )

    assert res.status_code == 200
    assert res.json() == {"text": "今天也辛苦了"}
    key, _, size = speech.transcribed[-1]
    assert key.api_key == DEPLOYER_SONIOX_KEY and size == len(PCM)


async def test_nothing_heard_asks_again(make_client: ClientFactory, speech: FakeSpeech):
    speech.heard = ""
    client = make_client(FakeLLM())

    res = await client.post("/api/voice", content=PCM)

    assert res.status_code == 422
    assert "没有听清" in res.json()["detail"]


async def test_a_failing_service_is_not_a_recorded_turn(
    make_client: ClientFactory, speech: FakeSpeech
):
    speech.rejects[DEPLOYER_SONIOX_KEY] = "这家服务连不上"
    client = make_client(FakeLLM())

    res = await client.post("/api/voice", content=PCM)

    assert res.status_code == 502
    assert "没能听清" in res.json()["detail"]


async def test_without_a_key_it_says_so(make_client: ClientFactory):
    client = make_client(FakeLLM(), voice_configured=False)

    res = await client.post("/api/voice", content=PCM)

    assert res.status_code == 503
    assert "语音识别" in res.json()["detail"]


async def test_no_sound_is_refused(make_client: ClientFactory):
    client = make_client(FakeLLM())

    res = await client.post("/api/voice", content=b"")

    assert res.status_code == 422
    assert "没有收到声音" in res.json()["detail"]


async def test_only_a_signed_in_user_may_send_one(make_client: ClientFactory):
    client: httpx.AsyncClient = make_client(FakeLLM(), user=None)

    res = await client.post("/api/voice", content=PCM)

    assert res.status_code == 401


async def test_a_soniox_key_cannot_hear_a_voice_message():
    """Soniox hears a call as it comes; a voice message is one whole recording, which only
    DashScope takes in one task."""
    with pytest.raises(RuntimeError, match="百炼"):
        await SpeechServices().transcribe(SttKey("soniox", "some-key"), "model", PCM)
