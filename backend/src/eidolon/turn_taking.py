"""The rules for taking turns during a call (GLOSSARY.md「回合」「补充」「打断」「只看文字」).

`TurnTaking` is all the rules are: `CallTurns` reports what happens during the call (the
user starting to talk, what they said or typed, how the reply is getting on, the
character's voice starting and stopping) and is told, event by event, what to do about
it. It keeps no time and waits for nothing; each event is answered at once with the
commands to carry out, in order, and by then the rules have already moved on, so no
event reported while the commands are being carried out finds them where they were.
"""

from dataclasses import dataclass
from typing import Literal

from eidolon.reply_format import Lang


@dataclass(frozen=True)
class DropReply:
    """Drop the reply in progress without a trace, and report `reply_dropped` once it is
    gone. Told again while it is going, wait until it is gone."""


@dataclass(frozen=True)
class DropTurn:
    """Drop the turn in progress, its reply and all, without a trace: the turn is over."""


@dataclass(frozen=True)
class StopReply:
    """Have the reply in progress go no further: it is recorded with only the segments
    complete by then."""


@dataclass(frozen=True)
class ClearVoice:
    """Cut off what has gone to TTS but has not been voiced yet."""


@dataclass(frozen=True)
class Reply:
    """Reply to the turn in progress, the user having said `text`, afresh if it was
    replied to already; `voiced` says whether the reply is to be voiced at all. Replies
    are numbered from 1 within the call, one after another, a reply given afresh getting
    a number of its own: `number` is this one's."""

    text: str
    voiced: bool
    number: int


@dataclass(frozen=True)
class Voice:
    """Send `text`, some of the Japanese of segment `segment` of reply `reply`, to TTS."""

    text: str
    reply: int
    segment: int


@dataclass(frozen=True)
class FlushVoice:
    """Have TTS voice now all it has of segment `segment` of reply `reply`: the segment
    has all its Japanese."""

    reply: int
    segment: int


@dataclass(frozen=True)
class WaitForFollowOn:
    """Wait, afresh if already waiting, for the follow-on the user started to be
    transcribed, and report `follow_on_missed` if it takes too long. A `Reply` ends
    the wait."""


@dataclass(frozen=True)
class QueueTurn:
    """Take up `text`, what the user said or typed, as the next turn, once the turn in
    progress is over."""

    text: str


@dataclass(frozen=True)
class Spoke:
    """The character has just started speaking the reply in progress (GLOSSARY.md「开口」):
    told once for each reply."""


Command = (
    DropReply | DropTurn | StopReply | ClearVoice | Reply | Voice | FlushVoice | WaitForFollowOn | QueueTurn
    | Spoke
)

_ReplyState = Literal["replying", "dropping", "dropped"]
"""How the reply to the turn in progress is getting on: being given, being dropped for a
follow-on, or dropped and waiting for the follow-on to be transcribed."""


class TurnTaking:
    """Whose turn it is during a call, one turn at a time.

    A turn is taken up (`turn_started`) with what the user said, and replied to. Until
    the reply can be interrupted, what the user says or types is a follow-on: the reply
    is dropped without a trace, what was voiced of it is cut off, and the turn is replied
    to afresh with the follow-on joined on a new line. The user starting to talk is
    enough to drop the reply; should what they said come to nothing (transcribed blank,
    or not at all in time), the turn is replied to again as it was.

    A reply can be interrupted once the character has started speaking it, or it is
    recorded, and it has a complete segment. She has started speaking it (「开口」) once
    her voice starts playing; when the reply is not voiced, once its first line is shown.
    Her voice starting counts only once some of this reply has gone to TTS, since a
    dropped reply's voice may start late; and should the last reply's voice still be
    playing when this one's first words go to TTS, she has started speaking it then,
    without starting again. `CallTurns` is told she spoke (`Spoke`) as she starts speaking
    each reply, a recorded one too, should its voice start only afterwards.

    After that, the user starting to talk or sending what they typed interrupts her: the
    reply stops and is voiced no further, to be recorded with only its complete segments,
    and what the user says or types is the next turn. Typing between replies stops her
    voice likewise, should the last one still be heard.

    Whether replies are voiced (「只看文字」) is decided as each one starts. A voiced
    reply's Japanese goes to TTS segment by segment, each voiced in full as soon as it is
    complete, rather than held back for the next one's words. Once the
    call is ending, nothing the user says or types is taken up, and her last reply is
    left to be voiced. Should she hang up on the user for what happened outside the call,
    the call ends straight away: a reply she can be interrupted in stops as though she
    were, and the turn of one she cannot is dropped; what has gone to TTS is left to be
    voiced.
    """

    def __init__(self, text_only: bool) -> None:
        self._text_only = text_only
        self._ending = False
        self._voice_playing = False  # the character's voice is playing, whichever reply's
        self._replies = 0  # replies given so far, the one in progress included
        # The turn in progress:
        self._said: list[str] = []  # what the user said in it, follow-ons included
        self._reply_state: _ReplyState | None = None  # None: there is no turn in progress
        self._following_on = False  # a follow-on the user started is not yet transcribed
        # Its reply:
        self._voicing = False
        self._sent_to_tts = False  # some of it is on its way to TTS
        self._voiced_segment: int | None = None  # the last segment of it sent to TTS
        self._spoken = False  # the character has started speaking it, or it is recorded
        self._told_spoken = False  # `CallTurns` has been told she started speaking it
        self._complete = False  # it has a complete segment

    @property
    def ending(self) -> bool:
        """Whether the call is ending, so that nothing more is taken up."""
        return self._ending

    # What the user does.

    def user_started_talking(self) -> list[Command]:
        """The user started to talk (Pipecat's `InterruptionFrame`)."""
        if self._ending:
            return []
        if not self._open_to_follow_ons():
            return self._interrupt()
        self._following_on = True
        if self._reply_state == "dropped":  # heard again while waiting for the follow-on
            return [WaitForFollowOn()]
        self._reply_state = "dropping"
        return [DropReply()]

    def user_heard(self) -> list[Command]:
        """Some of what the user is saying has been heard, not yet transcribed in full
        (Pipecat's `InterimTranscriptionFrame`)."""
        if self._following_on and self._reply_state == "dropped":
            return [WaitForFollowOn()]
        return []

    def user_said(self, text: str) -> list[Command]:
        """What the user said is transcribed, blank if it came to nothing."""
        text = text.strip()
        if self._ending:
            return []
        if self._open_to_follow_ons() and (text or self._following_on):
            return self._follow_on(text)
        return [QueueTurn(text)] if text else []

    def user_typed(self, text: str) -> list[Command]:
        """The user sent what they typed."""
        text = text.strip()
        if self._ending or not text:
            return []
        if self._open_to_follow_ons():
            return self._follow_on(text)
        return [*self._interrupt(), ClearVoice(), QueueTurn(text)]

    def text_only_switched(self, text_only: bool) -> list[Command]:
        """The user switched text only (「只看文字」) on or off, for replies from now on."""
        self._text_only = text_only
        return []

    # How the reply is getting on.

    def turn_started(self, text: str) -> list[Command]:
        """The next turn is taken up, the user having said `text`."""
        if self._ending:
            return []
        self._said = [text]
        return [self._reply_afresh()]

    def reply_delta(self, lang: Lang, text: str, segment: int) -> list[Command]:
        """Some of segment `segment` of the reply, in `lang`, has been shown."""
        if not self._voicing:
            return self._spoke()  # its first line is shown
        if lang != "ja":
            return []
        voice: list[Command] = [Voice(text, self._replies, segment)]
        self._voiced_segment = segment
        if not self._sent_to_tts:  # its first words: is the last reply's voice still playing?
            self._sent_to_tts = True
            if self._voice_playing:
                return [*voice, *self._spoke()]
        return voice

    def segment_complete(self, segment: int) -> list[Command]:
        """Segment `segment` of the reply is complete."""
        self._complete = True
        if self._voicing and self._voiced_segment == segment:
            return [FlushVoice(self._replies, segment)]
        return []

    def reply_recorded(self) -> list[Command]:
        """The reply is recorded, so it is no longer to be dropped."""
        self._spoken = True
        return []

    def reply_ended(self) -> list[Command]:
        """The reply is over, recorded or not (it failed, or was rejected): so is the turn."""
        if self._reply_state == "replying":
            self._reply_state = None
        return []

    def reply_dropped(self) -> list[Reply | WaitForFollowOn]:
        """The reply `DropReply` was about is gone."""
        if self._reply_state != "dropping":
            return []
        if self._following_on:
            self._reply_state = "dropped"
            return [WaitForFollowOn()]
        return [self._reply_afresh()]

    def follow_on_missed(self) -> list[Reply]:
        """What `WaitForFollowOn` waited for took too long: it came to nothing."""
        if not (self._following_on and self._reply_state == "dropped"):
            return []
        self._following_on = False
        return [self._reply_afresh()]

    # The character's voice, and the call.

    def voice_started(self) -> list[Command]:
        """The character's voice started playing (Pipecat's `BotStartedSpeakingFrame`).
        The voice of a reply dropped just now may start late, but never after the next
        reply's first words are sent: those take the chat model a while."""
        self._voice_playing = True
        if self._voicing and self._sent_to_tts:
            return self._spoke()
        return []

    def voice_stopped(self) -> list[Command]:
        """The character's voice stopped playing (Pipecat's `BotStoppedSpeakingFrame`)."""
        self._voice_playing = False
        return []

    def call_ending(self) -> list[Command]:
        """The call is ending: nothing the user says or types is taken up from now on."""
        self._ending = True
        return []

    def hung_up_on(self) -> list[Command]:
        """She hangs up on the user straight away, for what happened outside the call: the
        call is ending, and the turn in progress, if any, goes no further."""
        if self._ending:
            return []
        self._ending = True
        if self._reply_state is None:
            return []
        if self._open_to_follow_ons():
            self._reply_state = None
            self._following_on = False
            return [DropTurn()]
        return self._interrupt()

    def _spoke(self) -> list[Command]:
        """The character has started speaking the reply in progress: `CallTurns` is told
        so, unless it has been already."""
        self._spoken = True
        if self._told_spoken:
            return []
        self._told_spoken = True
        return [Spoke()]

    def _open_to_follow_ons(self) -> bool:
        """Whether there is a turn in progress whose reply cannot be interrupted yet."""
        if self._reply_state is None:
            return False
        return self._reply_state != "replying" or not (self._spoken and self._complete)

    def _follow_on(self, text: str) -> list[Command]:
        """Join `text`, if any, onto the turn in progress, which is to be replied to afresh."""
        if text:
            self._said.append(text)
        if self._following_on:  # the reply is dropped already, and what TTS held cut off
            self._following_on = False
            return [self._reply_afresh()] if self._reply_state == "dropped" else []
        self._reply_state = "dropping"
        return [DropReply(), ClearVoice()]

    def _interrupt(self) -> list[Command]:
        """Interrupt the reply in progress, if there is one."""
        if self._reply_state is None:
            return []
        self._voicing = False
        return [StopReply()]

    def _reply_afresh(self) -> Reply:
        """Reply to the turn in progress as it now is, voiced unless text only."""
        self._reply_state = "replying"
        self._replies += 1
        self._voicing = not self._text_only
        self._sent_to_tts = self._spoken = self._told_spoken = self._complete = False
        self._voiced_segment = None
        return Reply("\n".join(self._said), self._voicing, self._replies)
