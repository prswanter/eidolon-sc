"""Pictures the user sends with a turn, driven through the backend's external API."""

import base64

import httpx

from eidolon.llm import LLMError
from tests.conftest import ClientFactory
from tests.fakes import FakeLLM, context_of
from tests.test_text_turn import send_turn, start_conversation

PICTURE = b"\x89PNG\r\n\x1a\n fake picture"
"""What the user sent: neither a model nor the backend looks inside it here."""
DATA_URL = "data:image/png;base64," + base64.b64encode(PICTURE).decode()

SEEN = "窗台上有一只橘猫\n不确定"
"""What the model answers about the picture: what it shows, then whether it is her."""
REPLY = "<ja>猫だね、かわいい</ja><zh>是猫呢，好可爱</zh>"


async def test_picture_is_read_before_her_reply_and_kept_with_the_message(
    make_client: ClientFactory,
):
    llm = FakeLLM([SEEN], [REPLY])
    client = make_client(llm)
    conversation_id = await start_conversation(client)

    events = await send_turn(client, conversation_id, "看我拍的照片", image=DATA_URL)

    # Read on a question of its own first, apart from her character prompt.
    assert llm.prompts[0][-1].image == (PICTURE, "image/png")
    assert "先客观描述这张图片" in llm.prompts[0][-1].content
    # Then told to her in words, and the picture itself goes with the turn.
    assert "图里大概是：窗台上有一只橘猫" in context_of(llm.prompts[1])
    assert llm.prompts[1][-1].image == (PICTURE, "image/png")
    assert events[-1]["type"] == "done"
    assert events[-1]["message"]["zh"] == "是猫呢，好可爱"

    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    said = [entry for entry in record if entry["role"] == "user"]
    assert said[-1]["image"] is True
    picture = await client.get(f"/api/messages/{said[-1]['id']}/image")
    assert picture.status_code == 200
    assert picture.headers["content-type"] == "image/png"
    assert picture.content == PICTURE


async def test_a_reply_she_sent_has_no_picture_of_it(make_client: ClientFactory):
    llm = FakeLLM([REPLY])
    client = make_client(llm)
    conversation_id = await start_conversation(client)

    await send_turn(client, conversation_id, "你好呀")

    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    assert all("image" not in entry for entry in record)
    hers = [entry for entry in record if entry["role"] == "character"]
    assert (await client.get(f"/api/messages/{hers[-1]['id']}/image")).status_code == 404


async def test_a_picture_alone_is_a_turn(make_client: ClientFactory):
    llm = FakeLLM([SEEN], [REPLY])
    client = make_client(llm)
    conversation_id = await start_conversation(client)

    events = await send_turn(client, conversation_id, "", image=DATA_URL)

    assert events[-1]["type"] == "done"
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    said = [entry for entry in record if entry["role"] == "user"]
    assert said[-1]["text"] == "" and said[-1]["image"] is True


async def test_no_model_can_read_it_is_said_rather_than_pretended(make_client: ClientFactory):
    llm = FakeLLM(LLMError("this model cannot see pictures"))
    client = make_client(llm)
    conversation_id = await start_conversation(client)

    events = await send_turn(client, conversation_id, "看看这张", image=DATA_URL)

    assert events[-1]["type"] == "error"
    assert "看不懂图片" in events[-1]["message"]
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    assert record == []  # no reply was written, so nothing is on the record


async def test_a_picture_that_is_not_a_data_url_is_refused(make_client: ClientFactory):
    llm = FakeLLM([REPLY])
    client = make_client(llm)
    conversation_id = await start_conversation(client)

    res = await client.post(
        f"/api/conversations/{conversation_id}/turns",
        json={"text": "看看", "image": "https://example.com/cat.png"},
    )

    assert res.status_code == 422
    assert "data:image" in res.json()["detail"]


async def test_another_users_picture_is_not_readable(make_client: ClientFactory):
    llm = FakeLLM([SEEN], [REPLY])
    client = make_client(llm)
    conversation_id = await start_conversation(client)
    await send_turn(client, conversation_id, "", image=DATA_URL)
    record = (await client.get(f"/api/conversations/{conversation_id}/messages")).json()
    message_id = [entry for entry in record if entry["role"] == "user"][-1]["id"]

    other: httpx.AsyncClient = make_client(FakeLLM(), user="someone-else")

    assert (await other.get(f"/api/messages/{message_id}/image")).status_code == 404
