"""A fix for UDP on Windows' proactor event loop, which calls, through ICE, depend on.

CPython's `_ProactorDatagramTransport` never tells its protocol the connection is lost
when it is closed while a datagram is still being sent: `close()` leaves that to the
write in flight, whose callback `_loop_writing` then returns at once since the transport
is closing (https://github.com/python/cpython/issues/156920). aioice waits for
`connection_lost` to close each of its sockets, so closing a call's connection could
hang for good, and with it hanging up and shutting down. It happens most when the
browser has already gone and ICE is still sending it connectivity checks.

The fix (https://github.com/python/cpython/pull/156921) was merged in September 2026 and
backported as far as 3.13 only; 3.11 and 3.12, which take security fixes alone, keep the
bug. `install` patches those two (the backend runs on 3.11, `.python-version`) and can go
once the backend requires a 3.13 release with the fix. Linux, where the server is
deployed, uses the selector event loop and never had the bug.
"""

import sys


def install() -> None:
    """Have a closing UDP transport tell its protocol the connection is lost once the
    write in flight completes, on Windows before 3.13; elsewhere it does nothing."""
    if sys.platform != "win32" or sys.version_info >= (3, 13):
        return
    from asyncio import proactor_events

    transport = getattr(proactor_events, "_ProactorDatagramTransport")  # private, untyped
    loop_writing = transport._loop_writing

    def _loop_writing(self, fut=None):
        if self._conn_lost and fut is not None and fut is self._write_fut:
            self._write_fut = None  # what is still buffered is dropped, as before
            if self._closing:
                self._loop.call_soon(self._call_connection_lost, None)
            return
        return loop_writing(self, fut)

    transport._loop_writing = _loop_writing
