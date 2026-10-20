"""Before opening to the public: strangers' private lives stay out of the log, and a public
deployment embedding on Gemini's free tier is warned at startup."""

import logging
from dataclasses import replace

import pytest

from eidolon.config import EmbeddingSettings, Settings
from tests.conftest import ClientFactory
from tests.fakes import (
    FakeBackgroundLLM,
    FakeEmbedder,
    FakeJudge,
    FakeLLM,
    FakeLLMService,
    FakeReranker,
    build_faked,
)
from tests.test_text_turn import send_turn, start_conversation

REPLY = ["<ja>はいっ</ja><zh>好的</zh>"]
SECRET = "制作人偷偷告诉我他的银行卡密码"


async def test_a_memory_answer_that_cannot_be_read_is_logged_by_its_length_only(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
):
    unreadable = f"好的，我记下了：{SECRET}"  # not the JSON asked for
    client = make_client(
        FakeLLM(REPLY), retrieval_judge=FakeJudge(), embedder=FakeEmbedder(), reranker=FakeReranker(),
        background_llm=FakeBackgroundLLM(unreadable),
    )
    conversation_id = await start_conversation(client)

    with caplog.at_level(logging.DEBUG):
        await send_turn(client, conversation_id, "我的银行卡密码是七七八八")
        await client.get("/api/memories")  # waits for the memory to be written down

    [warning] = [r for r in caplog.records if "memories JSON" in r.getMessage()]
    assert f"({len(unreadable)} characters)" in warning.getMessage()
    assert conversation_id in warning.getMessage()
    assert SECRET not in caplog.text and "七七八八" not in caplog.text


GEMINI = EmbeddingSettings("gemini", "gemini-key", "gemini-embedding-2", "https://g.invalid", 1536)
SILICONFLOW = EmbeddingSettings("siliconflow", "sf-key", "Qwen/Qwen3-Embedding-0.6B", "https://s.invalid")


@pytest.mark.parametrize(
    ("domain", "embedding", "billing", "warned"),
    [
        ("eidolon.example.com", GEMINI, False, True),
        (None, GEMINI, False, False),  # not public
        ("eidolon.example.com", SILICONFLOW, False, False),  # not Gemini
        ("eidolon.example.com", GEMINI, True, False),  # billing is on
    ],
    ids=["public-gemini-free", "development", "siliconflow", "billing-on"],
)
async def test_a_public_deployment_on_geminis_free_tier_is_warned(
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
    domain: str | None,
    embedding: EmbeddingSettings,
    billing: bool,
    warned: bool,
):
    deployment = replace(
        settings, dev_login=False, domain=domain, embedding=embedding,
        gemini_billing_enabled=billing,
    )

    with caplog.at_level(logging.WARNING):
        backend = build_faked(
            deployment, FakeLLM(), embedder=FakeEmbedder(), identity_providers={},
            own_llm_service=FakeLLMService(),
        )
    await backend.aclose()

    warnings = [r.getMessage() for r in caplog.records if "GEMINI_BILLING_ENABLED" in r.getMessage()]
    assert bool(warnings) == warned
    if warned:
        assert "ADR-0005" in warnings[0]


def test_billing_is_declared_in_the_environment(monkeypatch: pytest.MonkeyPatch):
    for name, value in {
        "CHAT_LLM_BASE_URL": "http://llm.invalid/v1", "CHAT_LLM_API_KEY": "k",
        "CHAT_LLM_MODEL": "m",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("GEMINI_BILLING_ENABLED", raising=False)
    assert not Settings.from_env().gemini_billing_enabled

    monkeypatch.setenv("GEMINI_BILLING_ENABLED", "1")
    assert Settings.from_env().gemini_billing_enabled
