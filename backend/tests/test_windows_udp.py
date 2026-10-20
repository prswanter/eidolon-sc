"""Closing a UDP transport while a datagram is still being sent, on Windows' proactor event
loop: the protocol is still told the connection is lost, so ICE can finish closing and a
call's connection with it."""

import asyncio
import sys

import pytest

import eidolon.call  # noqa: F401  (patches the proactor event loop, as the server does)

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="only Windows' proactor loop")


class Datagrams(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        self.lost = asyncio.get_running_loop().create_future()

    def connection_lost(self, exc: Exception | None) -> None:
        if not self.lost.done():
            self.lost.set_result(exc)


async def test_closing_with_a_datagram_in_flight_still_loses_the_connection():
    loop = asyncio.get_running_loop()
    assert type(loop).__name__ == "ProactorEventLoop"  # the class is Windows-only to pyright
    transport, protocol = await loop.create_datagram_endpoint(
        Datagrams, local_addr=("127.0.0.1", 0)
    )
    transport.sendto(b"x", ("127.0.0.1", 9))  # still being sent as it closes
    transport.close()

    assert await asyncio.wait_for(protocol.lost, 2) is None

