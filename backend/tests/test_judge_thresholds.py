"""The judge model's thresholds, given per model: which group a model's name falls in, what
an unknown model gets, that retrieval and emotion judging use them, and how the emotion
settings override them."""

import logging
from dataclasses import replace

import httpx
import pytest

import eidolon.judge
import eidolon.live_config
from eidolon.assembly import Backend
from eidolon.config import CloudflareJudgeSettings, EmotionSettings, JevSettings, Settings
from eidolon.judge import (
    JUDGE_THRESHOLDS,
    JudgeThresholds,
    judge_family,
    judge_thresholds_for,
    same_judge_family,
    warn_if_uncalibrated,
)
from eidolon.retrieval import ModelRetrievalJudge
from tests.fakes import build_faked
from tests.test_assembly import Services
from tests.test_retrieval_services import MANO, client

ODD = JudgeThresholds(
    needs_retrieval=0.3, recall=0.7, about_producer=0.9, emotion=0.8, out_of_line=0.6,
    manipulation=0.4, photo=0.2,
)
"""Thresholds none of which is 0.5, to see that each is the one used."""


@pytest.mark.parametrize(
    "model, family",
    [
        ("typesafe/jev-1.13", "jev"),
        ("Cloudflare/Clef-Flash", "clef-flash"),
        ("clef", "clef"),
        ("cloudflare/clef-2", None),  # a new Clef is not judged by the old one's thresholds
    ],
)
def test_a_models_name_falls_in_its_group(model: str, family: str | None):
    assert judge_family(model) == family


def test_a_known_model_gets_its_groups_thresholds(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.WARNING):
        thresholds = judge_thresholds_for("cloudflare/clef-flash")

    assert thresholds == JUDGE_THRESHOLDS["clef-flash"]
    assert not caplog.records


def test_an_unknown_model_gets_jevs(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setitem(JUDGE_THRESHOLDS, "jev", ODD)

    assert judge_thresholds_for("someone/new-judge") == ODD


def test_only_an_unknown_model_is_warned_of(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.WARNING):
        warn_if_uncalibrated("typesafe/jev-1.14")
        warn_if_uncalibrated("someone/new-judge")

    [warning] = caplog.records
    assert "someone/new-judge" in warning.getMessage()


@pytest.mark.parametrize(
    "set_for, model, holds",
    [
        ("typesafe/jev-1.13", "jev-1.14", True),
        ("typesafe/jev-1.13", "clef", False),
        ("someone/new-judge", "someone/new-judge", True),
        ("someone/new-judge", "jev-1.13", False),
    ],
)
def test_thresholds_set_for_a_model_hold_for_its_family(set_for: str, model: str, holds: bool):
    assert same_judge_family(set_for, model) is holds


@pytest.mark.parametrize(
    "retrieve, recall, about_producer, expected",
    [
        (0.29, 0.69, 0.89, "nothing"),  # 0.5 would have recalled
        (0.29, 0.7, 0.1, "recall"),
        (0.3, 0.1, 0.1, "references"),  # 0.5 would have looked up nothing
        (0.1, 0.1, 0.9, "memories"),
    ],
)
async def test_retrieval_judges_by_the_thresholds_it_is_given(
    retrieve: float, recall: float, about_producer: float, expected: str
):
    answers = {
        "needs_retrieval": {"type": "noul", "noul": retrieve},
        "recall": {"type": "noul", "noul": recall},
        "about_producer": {"type": "noul", "noul": about_producer},
    }
    judge_model = eidolon.judge.JevJudge(
        "k", "typesafe/jev-1.13", "http://jev.test/api/v1",
        client(lambda _: httpx.Response(200, json={"answers": answers})),
    )

    assert await ModelRetrievalJudge(judge_model, ODD).judge(MANO, [], "那次比赛") == (expected, None, False)


@pytest.fixture
async def built(settings: Settings):
    made: list[Backend] = []

    def make(settings: Settings) -> Backend:
        services = Services()
        backend = build_faked(
            settings, services.chat, background_llm=services.background,
            embedder=services.embedder, reranker=services.reranker,
        )
        made.append(backend)
        return backend

    yield make
    for backend in made:
        await backend.aclose()


def emotion_threshold(backend: Backend) -> float:
    """What the next call judges her emotions by."""
    lease = backend.config.lease()
    lease.release()
    assert lease.keys.emotions is not None
    return lease.keys.emotions.min_probability


async def test_emotions_are_judged_by_the_models_threshold(
    settings: Settings, built, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setitem(JUDGE_THRESHOLDS, "clef", ODD)

    backend = built(replace(settings, judge=CloudflareJudgeSettings("t", "a", "clef")))

    assert emotion_threshold(backend) == 0.8


async def test_retrieval_is_judged_by_the_models_thresholds(
    settings: Settings, built, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setitem(JUDGE_THRESHOLDS, "clef-flash", ODD)
    judges: list[ModelRetrievalJudge] = []
    real = eidolon.live_config.ModelRetrievalJudge

    def recording(judge_model, thresholds):
        judges.append(real(judge_model, thresholds))
        return judges[-1]

    monkeypatch.setattr(eidolon.live_config, "ModelRetrievalJudge", recording)

    backend = built(replace(settings, judge=CloudflareJudgeSettings("t", "a", "clef-flash")))
    assert backend.engine._retrieval is not None
    await backend.engine._retrieval._judge.judge(MANO, [], "那次比赛")

    [judge] = judges
    assert judge.thresholds == ODD


async def test_the_emotion_setting_overrides_every_models_threshold(settings: Settings, built):
    backend = built(replace(
        settings, judge=JevSettings("k"), emotion=EmotionSettings(min_probability=0.35)
    ))

    assert emotion_threshold(backend) == 0.35


def test_judging_is_tuned_from_the_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JUDGE_EMOTION_MIN_PROBABILITY", "0.6")
    monkeypatch.setenv("JUDGE_EMOTION_TIMEOUT", "2")

    assert EmotionSettings.from_env() == EmotionSettings(min_probability=0.6, timeout=2.0)


def test_judging_defaults_to_the_models_threshold_and_a_second_and_a_half(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("JUDGE_EMOTION_MIN_PROBABILITY", raising=False)
    monkeypatch.setenv("JUDGE_EMOTION_TIMEOUT", "")

    assert EmotionSettings.from_env() == EmotionSettings(min_probability=None, timeout=1.5)


@pytest.mark.parametrize(
    "name, value", [("JUDGE_EMOTION_MIN_PROBABILITY", "1.5"), ("JUDGE_EMOTION_TIMEOUT", "0")]
)
def test_judging_tuned_out_of_range_stops_the_start(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
):
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError, match=name):
        EmotionSettings.from_env()


def test_the_old_names_stop_the_start_naming_the_new(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JEV_EMOTION_TIMEOUT", "2")

    with pytest.raises(RuntimeError, match="JEV_EMOTION_TIMEOUT 已改名为 JUDGE_EMOTION_TIMEOUT"):
        EmotionSettings.from_env()


def test_the_old_names_left_empty_are_no_matter(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JEV_EMOTION_MIN_PROBABILITY", "")
    monkeypatch.setenv("JEV_EMOTION_TIMEOUT", "")

    assert EmotionSettings.from_env() == EmotionSettings()
