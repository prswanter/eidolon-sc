"""What each document is embedded with besides its text: where it comes from, which
Gemini is told as its title (Qwen is not)."""

from pathlib import Path

from eidolon.characters import Character, parse_facts
from eidolon.corpus import Episode, Line, StoryCorpus
from eidolon.facts import CharacterFacts
from tests.fakes import FakeEmbedder

PARK = Episode(
    "produce_events/100100101", "培育剧情", "W.I.N.G.編", "公園の歌声", frozenset({"mano"}),
    (Line("真乃", "ほわっ……"),),
)


async def test_a_passage_is_titled_with_its_card_or_event_and_episode(tmp_path: Path):
    embedder = FakeEmbedder()
    corpus = StoryCorpus(tmp_path / "eidolon.db", embedder)

    await corpus.save([PARK])
    corpus.close()

    assert embedder.titles == ["W.I.N.G.編「公園の歌声」"]


async def test_a_fact_is_titled_with_its_headings(tmp_path: Path):
    embedder = FakeEmbedder()
    mano = Character(
        "mano", "櫻木真乃", "", "voice", "sheet", None, "#ffbad6",
        facts=parse_facts("喜欢鸟。\n# 人物关系\n## 風野灯織\n同组合的伙伴。"),
    )
    facts = CharacterFacts(tmp_path / "eidolon.db", embedder, [mano])

    assert await facts.embed_missing() == 2
    facts.close()

    assert embedder.titles == [None, "人物关系 / 風野灯織"]
