"""A model's reasoning effort and extra request body (ADR-0019): each protocol sends the
effort as it writes it, nothing when it is unset; the extra body is merged in last, deep,
so it may override what the adapter wrote, but may not touch what makes the request."""

import json

import httpx
import pytest

from eidolon.config import (
    ChatModelSettings,
    LLMProtocol,
    LLMSettings,
    ReasoningEffort,
    checked_extra_body,
)
from eidolon.llm import ChatMessage, Tool
from eidolon.llm.providers import open_chat_models, open_llm
from tests.test_llm_protocols import recorded

STREAMS: dict[LLMProtocol, str] = {
    "chat-completions": 'data: {"choices":[{"delta":{"content":"はい"}}]}\n\n',
    "responses": recorded("responses_text"),
    "anthropic": recorded("anthropic_text"),
}

PING = Tool("ping", "检查", {"type": "object", "properties": {}})

# What each adapter writes besides the prompt, model and stream when no effort is set.
WITHOUT_EFFORT: dict[LLMProtocol, dict] = {
    "chat-completions": {"stream_options": {"include_usage": True}},
    "responses": {"store": False},
    "anthropic": {"max_tokens": 16384},
}


async def sent(
    protocol: LLMProtocol,
    effort: ReasoningEffort | None = None,
    extra_body: dict | None = None,
    tools: list[Tool] | None = None,
) -> dict:
    """The body of the request a model with these settings sends."""
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, text=STREAMS[protocol])

    settings = LLMSettings(
        "https://llm.example/v1", "k", "m", protocol,
        reasoning_effort=effort, extra_body=extra_body,
    )
    llm = open_llm(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    async for _ in llm.stream([ChatMessage("user", "你好")], tools or []):
        pass
    await llm.aclose()
    return bodies[0]


def written(body: dict) -> dict:
    """What `body` carries beyond the prompt, the model and that it streams."""
    left_out = {"model", "stream", "messages", "input", "instructions", "system"}
    return {k: v for k, v in body.items() if k not in left_out}


@pytest.mark.parametrize("protocol", WITHOUT_EFFORT)
async def test_an_unset_effort_sends_nothing_of_it(protocol: LLMProtocol):
    assert written(await sent(protocol)) == WITHOUT_EFFORT[protocol]


async def test_chat_completions_sends_the_effort_as_reasoning_effort():
    body = await sent("chat-completions", "xhigh")

    assert written(body) == WITHOUT_EFFORT["chat-completions"] | {"reasoning_effort": "xhigh"}


@pytest.mark.parametrize("effort", ["none", "minimal"])
async def test_responses_sends_the_effort_and_asks_for_the_encrypted_reasoning(
    effort: ReasoningEffort,
):
    body = await sent("responses", effort)

    # With `store` off, the encrypted reasoning is all a tool round can send back of it;
    # with thinking off there is none to ask for.
    include = {} if effort == "none" else {"include": ["reasoning.encrypted_content"]}
    assert written(body) == WITHOUT_EFFORT["responses"] | {
        "reasoning": {"effort": effort}
    } | include


async def test_anthropic_turns_thinking_off_for_none():
    body = await sent("anthropic", "none")

    assert written(body) == WITHOUT_EFFORT["anthropic"] | {"thinking": {"type": "disabled"}}


async def test_anthropic_thinks_adaptively_at_the_effort_without_showing_it():
    body = await sent("anthropic", "max")

    assert written(body) == WITHOUT_EFFORT["anthropic"] | {
        "thinking": {"type": "adaptive", "display": "omitted"},
        "output_config": {"effort": "max"},
    }


async def test_the_extra_body_is_merged_in_deep_overriding_what_the_adapter_wrote():
    extra = {
        "thinking": {"type": "enabled", "budget_tokens": 2048},
        "output_config": {"format": "text"},
        "top_k": 5,
    }

    body = await sent("anthropic", "high", extra, tools=[PING])

    assert body["thinking"] == {"type": "enabled", "budget_tokens": 2048, "display": "omitted"}
    assert body["output_config"] == {"effort": "high", "format": "text"}
    assert body["top_k"] == 5
    assert [t["name"] for t in body["tools"]] == ["ping"]


@pytest.mark.parametrize("protocol", WITHOUT_EFFORT)
async def test_a_value_that_is_not_an_object_replaces_the_adapters(protocol: LLMProtocol):
    extra = {"reasoning_effort": None, "reasoning": "off", "thinking": None, "enable_thinking": False}

    body = await sent(protocol, "low", extra)

    for key, value in extra.items():
        assert body[key] == value


async def test_the_extra_body_is_not_changed_by_the_requests_it_goes_into():
    extra = {"reasoning": {"summary": "auto"}}

    await sent("responses", "high", extra)
    await sent("responses", "low", extra)

    assert extra == {"reasoning": {"summary": "auto"}}


# The extra body, checked the same wherever it comes from.

def test_an_extra_body_setting_thinking_or_anything_else_is_taken():
    extra = {"thinking": {"type": "disabled"}, "reasoning_effort": "high", "enable_thinking": False}

    assert checked_extra_body(extra) == extra


def test_an_extra_body_that_is_not_an_object_is_refused():
    with pytest.raises(ValueError, match="JSON 对象"):
        checked_extra_body(["enable_thinking"])


def test_an_extra_body_that_would_break_the_request_is_refused_naming_each_key():
    with pytest.raises(ValueError, match="「model」、「tools」"):
        checked_extra_body({"enable_thinking": False, "tools": [], "model": "x"})


# The chat model as text turns and calls use it: one model over one client, each at its own
# effort.

async def test_the_chat_models_text_and_call_requests_go_at_their_own_efforts_on_one_client():
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, text=STREAMS["chat-completions"])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    text = LLMSettings("https://llm.example/v1", "k", "m", reasoning_effort="high")
    models = open_chat_models(ChatModelSettings(text, call_effort=None), client)
    for llm in (models.text, models.call):
        async for _ in llm.stream([ChatMessage("user", "你好")]):
            pass
    await models.aclose()

    assert [body.get("reasoning_effort") for body in bodies] == ["high", None]
    assert "reasoning_effort" not in bodies[1]
    assert client.is_closed
