"""Building a model slot's provider from its settings, and checking the chat model can do
what conversations need of it."""

import httpx

from eidolon.config import (
    EFFORT_NAMES,
    ChatModelSettings,
    LLMProtocol,
    LLMSettings,
    ReasoningEffort,
)
from eidolon.llm import ChatLLM, ChatMessage, ChatModels, LLMError, Reasoning, Tool, ToolCall
from eidolon.llm.anthropic import AnthropicLLM
from eidolon.llm.openai_compat import OpenAICompatLLM
from eidolon.llm.responses import ResponsesLLM

LLM_TIMEOUT = httpx.Timeout(60, connect=10)

_PROVIDERS: dict[LLMProtocol, type[OpenAICompatLLM | ResponsesLLM | AnthropicLLM]] = {
    "chat-completions": OpenAICompatLLM,
    "responses": ResponsesLLM,
    "anthropic": AnthropicLLM,
}


def open_llm(settings: LLMSettings, client: httpx.AsyncClient | None = None) -> ChatLLM:
    provider = _PROVIDERS[settings.protocol]
    return provider(
        settings.base_url,
        settings.api_key,
        settings.model,
        client=client,
        max_tokens=settings.max_tokens,
        reasoning_effort=settings.reasoning_effort,
        extra_body=settings.extra_body,
    )


def open_chat_models(
    settings: ChatModelSettings, client: httpx.AsyncClient | None = None
) -> ChatModels:
    """The chat model as text turns and calls use it, both on `client`, else on one of
    their own."""
    client = client or httpx.AsyncClient(timeout=LLM_TIMEOUT)
    return ChatModels(open_llm(settings.text, client), open_llm(settings.call, client))


_PROBE_TOOL = Tool(
    "ping",
    "检查工具调用是否可用。",
    {"type": "object", "properties": {"ok": {"type": "boolean"}}},
)
_PROBE = [
    # As a turn's prompt is: parts marked for caching, and a system message after the
    # conversation so far; so a service that would refuse either refuses it here.
    ChatMessage("system", "你在协助一次连通性检查。", cache_breakpoint=True),
    ChatMessage("user", "你好。"),
    ChatMessage("assistant", "你好，请说。", cache_breakpoint=True),
    ChatMessage("system", "这是检查的最后一步。"),
    ChatMessage("user", "这是一次连通性检查，请调用 ping 工具，不用回复其他内容。"),
]
_PLAIN_PROBE = [
    ChatMessage("system", "你在协助一次连通性检查。"),
    ChatMessage("user", "这是一次连通性检查，请回复「好」。"),
]
_PROBE_RESULT = '{"ok": true}'


async def check_chat_llm(
    llm: ChatLLM, effort: ReasoningEffort | None = None, whose: str = ""
) -> None:
    """Raise an `LLMError` saying what is missing unless the model streams its reply to a
    request that offers it a tool, with parts marked for caching and a system message after
    the conversation so far as a turn's has, and, if it calls the tool, to the result of
    the call, as a turn's last round asks it:
    the same tools offered, none to be called. Whether it
    calls the tool is up to the model. A failure of a model opened with a reasoning
    `effort` is put down to the effort, `whose` it is (as 「通话的」) and in the service's
    own words first: the effort is sent as it is, whether the model knows it or not
    (ADR-0019); unless the model took it, answering without tools."""
    try:
        await _check(llm)
    except _CheckFailed as e:
        if effort is None or not e.effort_may_be_why:
            raise
        raise LLMError(
            f"{whose}思考强度『{EFFORT_NAMES[effort]}』被服务拒绝：{e.service_said}"
        ) from None


async def check_chat_models(models: ChatModels, settings: ChatModelSettings) -> None:
    """`check_chat_llm` for the chat model as text turns and calls use it, at each one's
    effort, saying which was refused; at both, if they are the same, once."""
    if settings.text.reasoning_effort == settings.call_effort:
        await check_chat_llm(models.text, settings.call_effort)
        return
    await check_chat_llm(models.text, settings.text.reasoning_effort, "文字的")
    await check_chat_llm(models.call, settings.call_effort, "通话的")


async def _check(llm: ChatLLM) -> None:
    try:
        await _probe(llm, [_PROBE_TOOL])
        return
    except _AnswerRefused:
        raise  # the model can call tools, so asking without them tells nothing
    except LLMError as e:
        with_tool = e
    try:  # the same request without the tool tells the two failures apart
        await _probe(llm, [])
    except LLMError as e:
        if (failed := await _failed_without_tool(llm, with_tool, e)) is not None:
            raise failed from None
    try:  # the first failure may have been passing, say a timeout or a rate limit
        await _probe(llm, [_PROBE_TOOL])
        return
    except LLMError as e:
        raise _CheckFailed(
            f"对话模型不支持工具调用（不提供工具时可以正常回复），无法使用「回顾剧情」：{e}", e,
            effort_may_be_why=False,
        ) from None


async def _failed_without_tool(
    llm: ChatLLM, with_tool: LLMError, without_tool: LLMError
) -> "_CheckFailed | None":
    """Why the check failed, with the tool and without: the marks for caching or the
    system message after the conversation so far, if the model answers a request without
    them but not, asked again, one with them; else the model's not streaming, or not
    answering at all. None if, asked again, it answers: the failures were passing."""
    try:
        await _probe(llm, [], _PLAIN_PROBE)
    except LLMError:
        return _CheckFailed(
            f"对话模型需要支持流式输出和工具调用，但检查请求失败：{with_tool}", with_tool
        )
    try:
        await _probe(llm, [])
        return None
    except LLMError as e:
        without_tool = e
    return _CheckFailed(
        f"对话模型不接受对话里的缓存标记或中途的系统消息（不带它们时可以正常回复）：{without_tool}",
        without_tool,
        effort_may_be_why=False,
    )


async def _probe(
    llm: ChatLLM, tools: list[Tool], prompt: list[ChatMessage] = _PROBE
) -> None:
    said = ""
    calls: list[ToolCall] = []
    reasoning: list[Reasoning] = []
    async for item in llm.stream(prompt, tools):
        if isinstance(item, ToolCall):
            calls.append(item)
        elif isinstance(item, Reasoning):
            reasoning.append(item)
        else:
            said += item
    if not calls:
        return
    answered = [
        *prompt,
        ChatMessage("assistant", said, tuple(calls), reasoning=tuple(reasoning)),
        *(ChatMessage("tool", _PROBE_RESULT, tool_call_id=c.id) for c in calls),
    ]
    try:
        async for _ in llm.stream(answered, tools, forbid_calls=True):
            pass
    except LLMError as e:
        raise _AnswerRefused(
            f"对话模型调用了工具，但收到工具结果后的下一轮请求失败，无法使用「回顾剧情」：{e}", e
        ) from None


class _CheckFailed(LLMError):
    """The check failed, saying what is missing; `service_said` is the failure the service
    reported, in its own words."""

    def __init__(
        self, message: str, failure: LLMError, *, effort_may_be_why: bool = True
    ) -> None:
        super().__init__(message)
        self.service_said = str(failure)
        self.effort_may_be_why = effort_may_be_why
        """False once the model answered with the same effort, without tools."""


class _AnswerRefused(_CheckFailed):
    """The model called the tool, but the request with the call's result failed."""
