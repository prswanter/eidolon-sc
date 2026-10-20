# 02: 通话中自带的语音 key 失败时，key 不出服务器

**What to build:** 补上 ADR-0017「服务器的日志和报错不能带出 key」的最后一块验证：通话中途，用户自带的语音合成 key 或语音识别 key 失败时，服务器的日志（logging 和 loguru，包括 Pipecat 自己打的）和发给用户的结束原因里都找不到这把 key。现在 `test_own_keys_in_logs.py` 只覆盖文字回合和三个校验接口，不打电话。如果测出泄漏，在这张票里把漏的那一处遮掉。

只改后端。背景见 `../spec.md`（「Testing Decisions」里「key 不出服务器」一条）。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- 只补测试，不重组遮蔽的做法（现在分散在几处）；测出漏处就修那一处，修法和已有的一致：先把 key 遮成 `***` 再截断。
- 经 `Browser.call` 跑真实的 WebRTC，`FakeSpeech` 让自带的那一项在通话中途失败，失败的原文里带上这把 key（模拟服务商把 key 回显在报错里）。
- 日志级别按生产的设置（loguru 只输出 INFO 以上），和已有的泄漏测试一样。

## 验收

- [x] 新测试：通话中自带的语音合成 key 失败，抓 logging 和 loguru 的输出，断言找不到 key；浏览器收到的结束消息里的原因也没有 key。
- [x] 新测试：同上，换成自带的语音识别 key。
- [x] 如果有泄漏：修好，并在 Comments 里写明漏在哪里、怎么修的。
- [x] `pytest` 全部通过，`ruff`、`pyright` 没有新的报错。
- [x] 人工验收清单写进 Comments（例如：设置页填一把故意写错的语音合成 key 拨号，看通话结束时的提示和服务器日志里都没有这把 key）。

## Comments

**2026-10-11 实现（分支 deepening-8-02）**

- 新测试在 `backend/tests/test_own_keys_in_logs.py`：`test_an_own_speech_key_failing_in_a_call_stays_out_of_the_logs_and_the_reason_given`，按语音合成（tts）和语音识别（stt，Soniox）各跑一次。经 `Browser.call` 打真实的 WebRTC 通话，自带的那一项在接通后失败，失败原文里带着 key（`echoing`，模拟服务商回显）。抓 logging（DEBUG 起）和 loguru（按生产 `__main__` 的设置，INFO 起），断言没有 key 的前缀，同时断言失败确实被记进了日志；浏览器收到的 `ended` 的 `message` 里也没有 key。`FakeSTT` / `FakeTTS` 的 `break_down` 加了一个可选参数，用来指定失败原文。
- **测出了泄漏**：两项都漏在同一个地方。Pipecat 的 `FrameProcessor.push_error_frame` 用 `logger.error` 把 `ErrorFrame.error` 原样打到 loguru（ERROR 级，生产照样输出），所以服务商回显的 key 会进服务器日志。发给用户的结束原因没有漏，它是固定文案（`OwnKeyFailed(..., "通话已结束")`），不带服务商的原文。
- 修法：`call._LiveCall` 给跑在用户自带 key 上的语音识别和语音合成各挂一个 `on_error` 处理函数（`call._masking`），把 `ErrorFrame.error` 里的 key 换成 `***`。Pipecat 的 `on_error` 是同步执行的，在打日志之前调用，所以日志里只剩 `***`。日志不给用户看，所以只遮不截断。拿掉这个处理函数，两个新测试都会失败。`own_keys.py` 模块文档补了一句说明。
- 没有处理的地方：Pipecat 的服务还会在别处直接打 `{e}`（比如 Soniox 发送失败时的 `logger.warning`）。这些不经 `ErrorFrame`，这次没遮，因为测试没测到、票里也没要求；真实的 Soniox / Fish 是把 key 放在首条消息或请求头里，一般不会出现在这些异常里。
- 验证：`pytest` 1140 个全部通过，`ruff`、`pyright` 都是 0 报错。第一次跑全量时，`test_bailian_stt.py` 的第一个测试出过一次 F，随后整个进程卡住，直到外面的 `timeout 550` 杀掉才停；faulthandler 和 pytest-timeout 都没有打出调用栈。之后单跑这个文件 6 次、跑全量 2 次都通过，没能复现。

**人工验收清单**

1. 设置页填一把故意写错的 Fish Audio key。试调会失败，所以要先填对的 key 保存，再到浏览器 localStorage 里把它改坏；也可以用一把已经欠费或作废的 key。然后拨号：通话结束时提示「你的语音合成（Fish Audio）密钥调用失败」之类，提示里没有这把 key；服务器日志（`docker compose logs backend`）里搜这把 key 的片段，搜不到，对应那行写的是 `***`。
2. 同上，换成语音识别（Soniox 或阿里云百炼）的 key，看结束提示和服务器日志。
