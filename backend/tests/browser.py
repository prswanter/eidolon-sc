"""The browser's side of a voice call, as the Pipecat client plays it: a silent microphone
and a data channel speaking RTVI, over a real WebRTC connection to the backend."""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import httpx
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import AudioStreamTrack
from fastapi import FastAPI

from eidolon.assembly import Backend

TIMEOUT = 10
"""Seconds to wait for anything over the connection; the loopback connects in well under one."""


class Browser:
    """One browser tab placing one call: `call` offers it, `connect` waits until the
    character is ready, then the user can speak (through the fake speech recognition) or
    `type`, and read each `turn` as the browser receives it."""

    def __init__(self) -> None:
        self.pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))  # host candidates only
        self.pc.addTrack(AudioStreamTrack())
        self._channel = self.pc.createDataChannel("rtvi")
        self._inbox: asyncio.Queue[dict] = asyncio.Queue()
        self.pc_id: str | None = None
        self._answer: RTCSessionDescription | None = None

        @self._channel.on("message")
        def receive(message: str) -> None:
            self._inbox.put_nowait(json.loads(message))

    async def offer(self, **request_data) -> dict:
        """The offer as the Pipecat client posts it, with our own request data."""
        await self.pc.setLocalDescription(await self.pc.createOffer())
        return {
            "sdp": self.pc.localDescription.sdp,
            "type": self.pc.localDescription.type,
            "pc_id": None,
            "restart_pc": False,
            "requestData": request_data,
        }

    async def call(self, client: httpx.AsyncClient, **request_data) -> httpx.Response:
        """Offer a call; the answer, if any, is kept for `connect`."""
        res = await client.post("/api/offer", json=await self.offer(**request_data))
        if res.status_code == 200:
            answer = res.json()
            self.pc_id = answer["pc_id"]
            self._answer = RTCSessionDescription(answer["sdp"], answer["type"])
        return res

    async def connect(self) -> None:
        """Take the answer and wait until the character is ready to talk."""
        assert self._answer is not None, "the call was not answered"
        await self.pc.setRemoteDescription(self._answer)
        opened = asyncio.Event()
        self._channel.on("open", opened.set)
        if self._channel.readyState != "open":
            await asyncio.wait_for(opened.wait(), TIMEOUT)
        self._send("client-ready", {"version": "1.0.0", "about": {"library": "tests"}})
        while (await self._next())["type"] != "bot-ready":
            pass

    def type(self, text: str) -> None:
        """Type during the call."""
        self._send("client-message", {"t": "user-text", "d": {"text": text}})

    async def turn(self) -> list[dict]:
        """The server messages of the next turn, `user` to `done` or `error`."""
        messages: list[dict] = []
        while True:
            message = await self._next()
            if message["type"] == "server-message":
                messages.append(message["data"])
                if message["data"]["type"] in ("done", "error"):
                    return messages

    async def next_server_message(self, type: str) -> dict:
        """Wait for the next server message of `type`, passing over the others."""
        while True:
            message = await self._next()
            if message["type"] == "server-message" and message["data"]["type"] == type:
                return message["data"]

    async def hung_up(self) -> None:
        """Wait until the backend hangs up: it says it has left before closing the connection."""
        while True:
            message = await self._next()
            if message.get("type") == "signalling" and message["message"]["type"] == "peerLeft":
                return

    async def hang_up(self) -> None:
        """Press 挂断: say so, as the call screen does, then close the connection."""
        self._send("client-message", {"t": "hang-up", "d": {}})
        async with asyncio.timeout(TIMEOUT):
            while self._channel.bufferedAmount > 0:
                await asyncio.sleep(0.01)
        await asyncio.sleep(0.1)  # for it to arrive ahead of the connection closing
        await self.close()

    async def close(self) -> None:
        """Close the connection without a word, as leaving the page does; one that will
        not close is given up, rather than hang the test."""
        try:
            await asyncio.wait_for(self.pc.close(), TIMEOUT)
        except TimeoutError:
            pass

    def _send(self, type: str, data: dict) -> None:
        self._channel.send(json.dumps({"label": "rtvi-ai", "type": type, "id": type, "data": data}))

    async def _next(self) -> dict:
        return await asyncio.wait_for(self._inbox.get(), TIMEOUT)


@asynccontextmanager
async def open_browser() -> AsyncIterator[Browser]:
    """Another browser, closed afterwards."""
    browser = Browser()
    try:
        yield browser
    finally:
        await browser.close()


async def until_gone(client: httpx.AsyncClient, pc_id: str) -> None:
    """Wait until the backend has let go of the call and settled it: it no longer takes ICE
    candidates for it, and has no call in progress. Pipecat lets go of the connection a moment
    before the call is settled (its use kept or given back), so the first alone is not enough;
    every test waiting here has no other call going."""
    end_of_candidates = {
        "pc_id": pc_id,
        "candidates": [{"candidate": "", "sdp_mid": "0", "sdp_mline_index": 0}],
    }
    transport = client._transport  # the test client talks to the backend in-process
    assert isinstance(transport, httpx.ASGITransport)
    backend: Backend = cast(FastAPI, transport.app).state.backend
    async with asyncio.timeout(TIMEOUT):
        while (await client.patch("/api/offer", json=end_of_candidates)).status_code != 404:
            await asyncio.sleep(0.05)
        while backend.calls.in_progress:
            await asyncio.sleep(0.05)
