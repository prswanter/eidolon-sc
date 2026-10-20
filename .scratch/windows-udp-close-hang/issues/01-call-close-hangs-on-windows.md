# 01: Windows 上关闭通话的 WebRTC 连接偶发一直卡住

**Status:** resolved

**发现于：** 2026-10-08，`memory-upgrade` 第三波跑完整 pytest 时卡住（被 pytest-timeout 结束），随后由子 agent 定位根因。

## 现象

完整跑 `backend/` 的 pytest 时，偶尔有一个通话测试在收尾阶段卡住，30 秒后 faulthandler 打出调用栈，60 秒后 pytest-timeout 结束整个进程。主线程停在 `pytest_asyncio` 的 finalizer 里（异步 fixture `make_client` 收尾：`Backend.aclose` → `Calls.aclose`），事件循环一直空等。被捕获的 stderr 里 Pipecat 的 PipelineWorker 已经结束，SmallWebRTC 打出 "ICE connection state is closed"。但这行日志出现时关闭还没完成：aiortc 在 `close()` 一开始就打这行，后面还要等 ICE 关完。

单独连跑 `test_rate_limit.py` 15 遍复现不了。完整套件跑约 9 遍复现了 4 次，卡在不同的通话测试里：

- `test_rate_limit.py::test_a_call_that_cannot_be_set_up_gives_its_use_back`
- `test_call.py::test_a_call_whose_voice_services_cannot_be_made_is_refused_and_does_not_count`
- `test_own_speech_keys.py::test_the_deployers_keys_serve_what_the_user_did_not_bring`
- `test_admin_delete_user.py::test_deleting_a_user_leaves_nothing_of_theirs_and_hangs_up_their_call`
- `test_user_recent_usage.py::test_the_list_is_sorted_by_the_last_24_hours...`：这次卡在测试调用阶段，推断是 `tests/browser.py` 的 `Browser.close()` 在关浏览器端的 aiortc 连接时卡住。

两个套件并行跑、负载高的时候更容易撞上。

## 根因

CPython 在 Windows 上默认用 `ProactorEventLoop`，它的 UDP 传输（`asyncio/proactor_events.py` 的 `_ProactorDatagramTransport`）有个问题：`sendto` 发出的写操作还没完成时就调用 `close()`，`connection_lost` 永远不会被调用。原因是 `close()` 看到有写操作在途，就不安排 `connection_lost`；等写完成回调 `_loop_writing` 跑到时，开头的 `if self._conn_lost: return` 直接返回。3.11.14 和 3.12.12 的代码都是这样，升级 Python 解决不了。

aioice 0.10.2 的 `StunProtocol.close`（`aioice/ice.py:293`）会 `await` 一个只在 `connection_lost` 里才 set 的 Future，于是一直等下去。等待链：

`call.py` `_LiveCall._serve` 的 finally → `self._connection.disconnect()` → pipecat `SmallWebRTCConnection.disconnect` → aiortc `RTCPeerConnection.close`（`rtcpeerconnection.py:532`，`RTCIceTransport.stop`）→ aioice `Connection.close`（`ice.py:636`）→ `StunProtocol.close`（`ice.py:293`）

`_serve` 结束不了，`_LiveCall.hang_up` 里的 `asyncio.wait({self._task})` 就一直等，`Calls.aclose` 也跟着卡住。

最容易撞上的情况是：服务端还没连上，浏览器端已经关了，ICE 还在往已经关掉的端口重发连通性检查，这时关闭连接正好落在「有写在途」的窗口里。

aiortc 有一种变体：自己发起的关闭没走完时，`RTCPeerConnection.close` 停在 `rtcpeerconnection.py:518` 的 `await self.__isClosed`，之后的每次 close 都会一直等。上面第 4 个测试就是这样。推测和本问题同源，没有单独证实。

**影响范围：** 只影响 Windows，也就是本地开发、本地起服务和本地测试。线上（`python:3.11-slim`，Linux，selector 事件循环）走的不是这段代码，不受影响。CI 也跑在 Linux 上，以前 `test_bailian_stt.py` 在 CI 挂住的那次（commit 2137dba）大概不是这个原因。

## 复现

最小脚本（Windows，Python 3.11 或 3.12），每次都能复现：

```python
import asyncio, sys
class P(asyncio.DatagramProtocol):
    def __init__(self): self.lost = asyncio.get_running_loop().create_future()
    def connection_lost(self, exc):
        if not self.lost.done(): self.lost.set_result(True)
async def one(send_before_close):
    loop = asyncio.get_running_loop()
    t, p = await loop.create_datagram_endpoint(P, local_addr=("127.0.0.1", 0))
    if send_before_close:
        t.sendto(b"x", ("127.0.0.1", 9))  # in flight in this loop iteration
    t.close()
    try:
        await asyncio.wait_for(asyncio.shield(p.lost), 2)
        return "connection_lost called"
    except asyncio.TimeoutError:
        return "HANG: connection_lost never called"
async def main():
    print(sys.version, type(asyncio.get_running_loop()).__name__)
    print("close without pending write:", await one(False))
    print("sendto then close same tick:", await one(True))
asyncio.run(main())
```

aiortc 层的压测：建两个 `RTCPeerConnection`，不让它们连通，先关一端，随机等 0–1.5 秒再关另一端。300 轮卡住 2 次，调用栈和上面的等待链一致。打上下面的补丁后再跑 300 轮，一次都没卡。

## 修法

1. **治本：只在 Windows 上给 `_ProactorDatagramTransport._loop_writing` 打补丁。** 写操作完成时如果传输已经在关闭，就安排 `_call_connection_lost`。补丁在应用启动时打，放在后端包里而不是只放在 conftest，因为本地起服务一样会卡。子 agent 验证过的写法：

   ```python
   import asyncio.proactor_events as pe
   _orig = pe._ProactorDatagramTransport._loop_writing
   def _loop_writing(self, fut=None):
       if self._conn_lost and fut is not None and fut is self._write_fut:
           self._write_fut = None
           if self._closing:
               self._loop.call_soon(self._call_connection_lost, None)
           return
       return _orig(self, fut)
   pe._ProactorDatagramTransport._loop_writing = _loop_writing
   ```

   补丁要写清楚是给哪个 CPython 问题打的、适用哪些版本，CPython 修好以后可以去掉。实现时顺便查一下 CPython 上游有没有对应的 issue 或 PR，查到就链接上。

2. **兜底：关闭连接加上限。** `_LiveCall._serve` 里的 `await self._connection.disconnect()` 包一层超时，超时记一条 warning 日志后放弃等待。这样不管哪一层出问题，`_serve` 都一定能结束，`hang_up` 和 `Calls.aclose` 也不会卡住。测试里 `tests/browser.py` 的 `Browser.close()` 同样加超时。

两项都做。第 1 项解决这次查到的原因，第 2 项防备 aiortc 那种 `__isClosed` 变体和以后的其他原因。

## 验收

- [x] 测试：在 Windows 的 Proactor 事件循环上，UDP 传输 `sendto` 之后马上 `close`，`connection_lost` 会被调用（就是上面的最小复现）。非 Windows 平台跳过。
- [x] 测试：服务端关闭 WebRTC 连接一直不返回时（用假的连接模拟），通话照样在超时后结束，`Calls.aclose` 能返回，并记下一条 warning。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。
- [x] 完整 pytest 连跑至少 10 遍（可以两个并行），一次都不卡。输出写进文件，外面包 timeout。
- [x] **人工验收（留给用户）**：本地起服务，打几通电话，其中有接通前就挂断的，关掉服务时不卡。

## Comments

**2026-10-08 实现**

- 治本：`backend/src/eidolon/windows_udp.py` 的 `install()` 给 `_loop_writing` 打补丁，`eidolon/call.py` 导入时调用。上游对应 CPython 问题 [gh-156920](https://github.com/python/cpython/issues/156920)，修复 PR 是 [#156921](https://github.com/python/cpython/pull/156921)。这个修复 2026-09 合入，只回移到 3.13（[#157609](https://github.com/python/cpython/pull/157609)）、3.14 和 3.15，3.11 和 3.12 不会再修，所以补丁只在 Windows、3.13 以下打。后端要求的 Python 升到带修复的 3.13 以后，这个补丁可以删掉。
- 兜底：`DISCONNECT_TIMEOUT = 5.0` 秒，超时记一条 warning 后放弃等待，用在三个地方：`_LiveCall._serve` 里的 `disconnect`；建通话失败时关连接；`Calls.aclose` 里的 `self._webrtc.close()`。最后这处不包的话，`aclose` 还会对同一个连接再 `disconnect` 一次，照样卡住。`tests/browser.py` 的 `Browser.close()` 也加了 `TIMEOUT` 上限。
- 兜底管不到的情况：已接通的通话里，Pipecat 的传输层在取消 pipeline 时也会关连接。这里卡住只受 Pipecat 自己的取消超时（20 秒）约束，不在这次兜底范围内。实际查到的卡死都是没接通的通话，那时传输层不会去关连接。所以 `test_call.py` 里的新测试模拟的是没接通的通话。
- 测试：
  - `tests/test_windows_udp.py`：最小复现，非 Windows 平台跳过。
  - `test_call.py::test_a_connection_that_will_not_close_is_given_up_and_the_call_still_ends`：把超时临时调成 100 秒时，确认这条测试会失败。
- 完整 pytest 先跑 1 遍，再两路并行各跑 5 遍，共 11 遍，每遍 1098 个全部通过，没有卡住，也没有 faulthandler 调用栈。`ruff` 和 `pyright` 没有报错。
- 人工验收（2026-10-08 用户确认通过）：本地起服务，打几通电话，其中有接通前就挂断的，关服务时不卡。
