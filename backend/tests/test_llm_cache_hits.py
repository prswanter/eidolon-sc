"""How much of a request's input hit the provider's prompt cache, as each protocol's adapter
tells it with what the request was billed for (`billing`): a part of the input, which
stays the whole of it; nothing where the service does not say."""

import json
from collections.abc import Callable

import httpx
import pytest

from eidolon.billing import Billing, billing
from eidolon.llm import ChatLLM, ChatMessage
from eidolon.llm.anthropic import AnthropicLLM
from eidolon.llm.openai_compat import OpenAICompatLLM
from eidolon.llm.responses import ResponsesLLM
from tests.test_llm_protocols import serving


def sse(*events: dict) -> str:
    return "".join(f"data: {json.dumps(e)}\n\n" for e in events)


def chat_completions(usage: dict) -> str:
    return sse(
        {"choices": [{"index": 0, "delta": {"content": "<ja>はい</ja><zh>好</zh>"}}]},
        {"choices": [], "usage": usage},
    ) + "data: [DONE]\n\n"


def responses(usage: dict) -> str:
    return sse(
        {"type": "response.output_text.delta", "output_index": 0, "delta": "<ja>はい</ja>"},
        {"type": "response.completed", "response": {"usage": usage}},
    )


def anthropic(started: dict, delta: dict) -> str:
    return sse(
        {"type": "message_start", "message": {"usage": started}},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0,
         "delta": {"type": "text_delta", "text": "<ja>はい</ja>"}},
        {"type": "content_block_stop", "index": 0},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": delta},
        {"type": "message_stop"},
    )


Adapter = Callable[[httpx.AsyncClient], ChatLLM]
CHAT: Adapter = lambda http: OpenAICompatLLM("https://llm.example/v1", "sk", "m", client=http)  # noqa: E731
RESPONSES: Adapter = lambda http: ResponsesLLM("https://llm.example/v1", "sk", "m", client=http)  # noqa: E731
ANTHROPIC: Adapter = lambda http: AnthropicLLM("https://llm.example/v1", "sk", "m", client=http)  # noqa: E731


async def billed(adapter: Adapter, stream: str) -> Billing:
    """What a request answered with `stream` was billed for."""
    llm = adapter(serving(stream, []))
    with billing(Billing()) as told:
        async for _ in llm.stream([ChatMessage("user", "你好")]):
            pass
    return told


@pytest.mark.parametrize(
    ("usage", "cached"),
    [
        # where OpenAI, DeepSeek, OpenRouter, Kimi and most others say it, first
        ({"prompt_tokens": 1000, "completion_tokens": 50,
          "prompt_tokens_details": {"cached_tokens": 768}, "prompt_cache_hit_tokens": 640}, 768),
        # DeepSeek's own name for it, where the other is missing
        ({"prompt_tokens": 1000, "completion_tokens": 50,
          "prompt_cache_hit_tokens": 640, "prompt_cache_miss_tokens": 360}, 640),
        # Kimi's older one
        ({"prompt_tokens": 1000, "completion_tokens": 50, "cached_tokens": 512}, 512),
        # none said
        ({"prompt_tokens": 1000, "completion_tokens": 50}, None),
    ],
    ids=["details", "deepseek", "kimi", "untold"],
)
async def test_chat_completions_tells_the_cache_hits_where_the_service_says(
    usage: dict, cached: int | None
):
    told = await billed(CHAT, chat_completions(usage))

    assert (told.unit, told.input, told.output, told.cached) == ("tokens", 1000, 50, cached)


@pytest.mark.parametrize(
    ("usage", "cached"),
    [
        ({"input_tokens": 1000, "output_tokens": 50,
          "input_tokens_details": {"cached_tokens": 896, "cache_write_tokens": 0}}, 896),
        ({"input_tokens": 1000, "output_tokens": 50}, None),
    ],
    ids=["told", "untold"],
)
async def test_responses_tells_the_cache_hits_where_the_service_says(
    usage: dict, cached: int | None
):
    told = await billed(RESPONSES, responses(usage))

    assert (told.input, told.output, told.cached) == (1000, 50, cached)


async def test_anthropic_tells_what_was_read_from_the_cache_as_a_part_of_all_the_input():
    """The Messages API counts what it read from the cache and what it wrote apart from the
    rest of the input; some services say so only as the message ends."""
    told = await billed(ANTHROPIC, anthropic(
        {"input_tokens": 100, "output_tokens": 1},
        {"output_tokens": 50, "cache_creation_input_tokens": 200, "cache_read_input_tokens": 700},
    ))

    assert (told.input, told.output, told.cached) == (1000, 50, 700)


async def test_anthropic_without_a_word_of_the_cache_tells_no_cache_hits():
    told = await billed(ANTHROPIC, anthropic({"input_tokens": 100}, {"output_tokens": 50}))

    assert (told.input, told.output, told.cached) == (100, 50, None)
