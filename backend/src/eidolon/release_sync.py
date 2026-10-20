"""Importing releases and songs, for `eidolon world sync` (`world_sync`).

The releases are the CDs on Lantis's Shiny Colors site: its discography lists them apart
from the Blu-rays, and each one's page has its title, release date (発売日), catalog
number (品番) and tracks in order, announced ones not out yet included. Lantis is the
official source, so whatever it says goes. It names a track's singers in one of several
ways, and the import reads them all:

- on the track's line, 「曲名 / 角色 (CV.声优)」, or on a 歌： line under it;
- in the title, for a version one idol or unit sings: 「曲名（櫻木真乃Ver.）」;
- nowhere on the track but at the top of the page, when the whole CD is by one idol,
  one unit or one special unit (アーティスト：Team.Stella, with its idols under it);
- nowhere on this page but on another's track of the same title.

A singer is an idol, matched by her name or by her CV's; one of the eight units, matched
by its name or its reading, which stands for its members; or a special unit or the
whole cast (シャイニーカラーズ) whose idols the page lists, which stands for them and,
for a special unit, is kept as the song's special unit. Off-vocal and game-size versions
and dramas are tracks but no songs.

Where Lantis leaves a track's singers out, or names a special unit without saying who
is in it, ふじわらはじめ (a fan-run song database with an API) fills them in from the
same disc's track list there, matching a later version (-5 colors-, 2023 Ver.) to the
song as first released. The spec had imas-db do this, but imas-db has no Shiny Colors
CDs, only setlists (checked 2026-09-28; ADR-0008). A name Lantis gives without its idols
is only filled in if it is a group: the whole cast, one some Lantis page lists the idols
of, or one ふじわらはじめ names too. Anyone else Lantis names who is none of the idols
stays so, whatever ふじわらはじめ says. On each disc it was asked about, where it
disagrees with Lantis, Lantis is kept and the report lists it. A track whose singers are
still unknown, or which names anyone who is none of the idols, gets no song, and the
report lists it for the deployer to look into. What the deployer then finds out by hand
(`TrackCorrections`) goes over whatever the sources say.

The whole cast is no special unit, however it is written (シャイニーカラーズ(28人)), nor
is a special unit kept for a song ふじわらはじめ tells is sung by one idol or by exactly
one unit, unless Lantis names it.

A song is a title (the first way a release spells it) and its singers: the same title
sung by others is another song. Neither lyrics nor credits are kept. Every release and
song keeps the pages it came from.
"""

import asyncio
import html
import json
import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date

from eidolon.roster import Roster, unit_key
from eidolon.sync_tools import Fetch, without_spaces
from eidolon.world import Idol, Release, Song, Track, WorldSyncError

LANTIS_URL = "https://shinycolors.lantis.jp/discography/"
FUJI_API = "https://api.fujiwarahaji.me/v4/"
FUJI_SONGS_URL = FUJI_API + "list?type=music&music_type=sc&limit=1000"
FUJI_NAME = "ふじわらはじめ"
ALL_IDOLS = "シャイニーカラーズ"
"""How the sources name the whole cast, with or without a head count after it: not a
special unit."""

_RELEASE_LINK = re.compile(r'href="(https://shinycolors\.lantis\.jp/releaseinfo/[\w-]+/)"')
_TRACK = re.compile(r"^M?\d+\s*[.．]\s*(.+)$")
"""A numbered track: 1．, 01., or M1. on a drama's or a musical's CD."""
_NO_SONG = re.compile(r"off\s*vocal|game\s*size|instrumental|karaoke|ドラマ|カラオケ|トーク", re.I)
_VERSION = re.compile(r"(?:[（(]\s*(.+?)\s*Ver\.?\s*[)）]|\s(.+?)\s*Ver\.?)\s*$")
_BASE = [
    re.compile(r"\s*-\s*\d+\s*colors\s*-\s*$", re.I),
    re.compile(r"\s*[（(]\s*\d{4}\s*Ver\.?\s*[)）]\s*$", re.I),
]
"""How a release names a later version of a song ふじわらはじめ keeps under its first name."""
_META = (
    "歌：", "作詞", "作曲", "編曲", "リミックス", "アンサンブル", "以上", "DISC", "BONUS", "[", "＜", "<",
)


@dataclass
class ReleaseImport:
    releases: tuple[Release, ...]
    songs: tuple[Song, ...]
    filled: list[str] = field(default_factory=list)
    """Tracks whose singers ふじわらはじめ filled in."""
    conflicts: list[str] = field(default_factory=list)
    """Where ふじわらはじめ disagrees with Lantis, which was kept."""
    unmatched: list[str] = field(default_factory=list)
    """Tracks naming a singer who is none of the idols: no song written."""
    unknown: list[str] = field(default_factory=list)
    """Tracks whose singers no source says: no song written."""
    corrected: list[str] = field(default_factory=list)
    """Tracks the corrections set."""
    unused_corrections: list[str] = field(default_factory=list)
    """Corrections no track matched."""
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class TrackCorrection:
    title: str
    """The track's title as Lantis gives it: a correction for a track that is no longer
    that one (the release renumbered) is not applied."""
    singers: tuple[str, ...] | None
    """None for a track that is no song."""
    special_unit: str | None
    sources: tuple[str, ...]
    note: str


@dataclass
class TrackCorrections:
    """Who sings the tracks no source says, or says wrong, as the deployer has found out
    by hand (`world-corrections.json` beside the data file), applied on every import
    over whatever Lantis and ふじわらはじめ say: the idols, and the special unit if one
    sang it, or that it is no song (an instrumental, a remix)."""

    tracks: dict[tuple[str, int], TrackCorrection] = field(default_factory=dict)
    """By catalog number and track number, from 1."""

    @classmethod
    def from_json(cls, data: dict, idols: Iterable[Idol], where: str) -> "TrackCorrections":
        """Raises WorldSyncError, naming `where`, if it is malformed or names someone
        who is none of the idols."""
        names = {idol.name for idol in idols}
        corrections = cls()
        try:
            for track in data.get("tracks", []):
                singers = None if track.get("no_song") else tuple(track["singers"])
                strangers = [name for name in singers or () if name not in names]
                if strangers:
                    raise WorldSyncError(
                        f"{where} 里 {track['catalog']} 第 {track['track']} 首的演唱者不在偶像名单里："
                        + "、".join(strangers)
                    )
                corrections.tracks[(track["catalog"], int(track["track"]))] = TrackCorrection(
                    track["title"], singers, track.get("special_unit"), tuple(track["sources"]),
                    track.get("note", ""),
                )
        except (KeyError, TypeError, ValueError, AttributeError) as e:
            raise WorldSyncError(f"{where} 缺少或写错了字段：{e!r}") from None
        return corrections


@dataclass
class _Track:
    title: str
    singers_text: str | None = None
    """What the page says sings it, if it says."""
    group_members: str | None = None
    """The idols the page lists under a 歌： line naming a group."""
    singers: list[str] | None = None
    special: str | None = None
    no_song: bool = False
    bad: list[str] = field(default_factory=list)
    """Singers the page names who are none of the idols."""
    named: list[str] = field(default_factory=list)
    """The idols the page's other names for its singers stand for, beside the bad ones."""
    sources: list[str] = field(default_factory=list)


@dataclass
class _Release:
    url: str
    title: str
    date: date
    catalog: str
    artist: str
    artist_members: str | None
    tracks: list[_Track]

    @property
    def groups(self) -> dict[str, str]:
        """The groups whose idols the page lists, by name."""
        groups = {}
        if self.artist_members:
            groups[without_spaces(self.artist)] = self.artist_members
        for track in self.tracks:
            if track.singers_text and track.group_members:
                groups[without_spaces(track.singers_text)] = track.group_members
        return groups


async def import_releases(
    fetch: Fetch, roster: Roster, corrections: TrackCorrections | None = None,
) -> ReleaseImport:
    """The releases and songs as Lantis and ふじわらはじめ have them now, the singers
    matched to the idols and units on `roster`, `corrections` applied. Raises WorldSyncError if
    either cannot be read."""
    fan_songs = await _fuji_songs(fetch)
    discography = await fetch(LANTIS_URL)
    urls = _cd_links(discography)
    notes: list[str] = []
    limit = asyncio.Semaphore(4)

    async def page(url: str) -> _Release:
        async with limit:
            return _parse_release(url, await fetch(url), notes)

    releases = sorted(await asyncio.gather(*map(page, urls)), key=lambda r: (r.date, r.catalog))
    result = ReleaseImport((), (), notes=notes)
    singers = _Singers(roster)
    _resolve_from_lantis(releases, singers)
    fuji = _Fuji(fetch, fan_songs, singers, _listed_groups(releases, singers), notes)
    for release in releases:
        if any(_open(track) for track in release.tracks):
            await fuji.fill(release, result)
    _correct(releases, corrections or TrackCorrections(), result)
    for release in releases:
        for number, track in enumerate(release.tracks, 1):
            where = f"{release.catalog}《{release.title}》第 {number} 首「{track.title}」"
            if track.no_song or track.singers is not None:
                continue
            if track.bad:
                result.unmatched.append(f"{where}：{'、'.join(track.bad)}")
            else:
                result.unknown.append(where)
    result.releases, result.songs = _assemble(releases)
    return result


def _correct(releases: Iterable[_Release], corrections: TrackCorrections, result: ReleaseImport) -> None:
    unused = dict(corrections.tracks)
    for release in releases:
        for number, track in enumerate(release.tracks, 1):
            correction = unused.get((release.catalog, number))
            if correction is None or correction.title != track.title:
                continue
            del unused[(release.catalog, number)]
            track.no_song = correction.singers is None
            track.singers = list(correction.singers) if correction.singers is not None else None
            track.special = correction.special_unit
            track.sources = list(correction.sources)
            result.corrected.append(
                f"{release.catalog} 第 {number} 首「{track.title}」：{correction.note or '、'.join(correction.sources)}"
            )
    result.unused_corrections = [
        f"{catalog} 第 {number} 首「{correction.title}」" for (catalog, number), correction in unused.items()
    ]


def _open(track: _Track) -> bool:
    return not track.no_song and track.singers is None


# Lantis


def _cd_links(discography: str) -> list[str]:
    start, end = discography.find('class="CD_area"'), discography.find('class="BD_area"')
    if start == -1:
        raise WorldSyncError(f"{LANTIS_URL} 上找不到 CD 一览，页面结构可能变了")
    urls = list(dict.fromkeys(_RELEASE_LINK.findall(discography[start:end if end > start else None])))
    if not urls:
        raise WorldSyncError(f"{LANTIS_URL} 上找不到任何 CD，页面结构可能变了")
    return urls


def _lines(fragment: str) -> list[str]:
    text = re.sub(r"<br\s*/?>", "\n", fragment)
    text = re.sub(r"</?(?:p|h\d|div|li|ul)\b[^>]*>", "\n", text)
    text = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', r"[\1]", text)
    text = re.sub(r"<[^>]+>", "", text)
    lines = html.unescape(text).replace("　", " ").splitlines()
    return [line.strip() for line in lines if line.strip()]


def _parse_date(text: str, separator: str) -> date | None:
    match = re.search(rf"(\d{{4}}){re.escape(separator)}(\d{{1,2}}){re.escape(separator)}(\d{{1,2}})", text)
    if not match:
        return None
    try:
        return date(*map(int, match.groups()))
    except ValueError:
        return None


def _parse_release(url: str, page: str, notes: list[str]) -> _Release:
    title = re.search(r'<div class="titles">.*?<h2>(.*?)</h2>', page, re.S)
    banner = re.search(r'<div class="date">([^<]*)</div>', page)
    contents = re.search(r'<div class="release_contents">(.*?)<!--release_contents-->', page, re.S)
    if not title or not contents:
        raise WorldSyncError(f"{url} 上找不到唱片名或唱片内容，页面结构可能变了")
    lines = _lines(contents.group(1))
    index = next((i for i, line in enumerate(lines) if line.startswith("[インデックス")), len(lines))
    artist, members, day, catalog = "", None, None, None
    for i, line in enumerate(lines[:index]):
        if line.startswith("アーティスト："):
            artist = line.split("：", 1)[1].strip()
            under = []
            for next_line in lines[i + 1:index]:
                if next_line.startswith(("発売日", "品番", "価格", "[")):
                    break
                under.append(next_line)
            members = "、".join(under).strip("、") or None
        elif line.startswith("発売日："):
            day = _parse_date(line, "/")
        elif line.startswith("品番："):
            catalog = line.split("：", 1)[1].strip()
    banner_text = banner.group(1).strip() if banner else ""
    banner_day = _parse_date(banner_text, ".")
    if day and banner_day and day != banner_day:
        notes.append(
            f"{catalog}：Lantis 页面标题上方写 {banner_text}，"
            f"発売日写 {day.year}/{day.month}/{day.day}，按発売日写入"
        )
    day = day or banner_day
    if catalog is None or day is None:
        raise WorldSyncError(f"{url} 上找不到品番或发售日，页面结构可能变了")
    return _Release(
        url, _text(title.group(1)), day, catalog, artist, members, _parse_tracks(lines[index + 1:])
    )


def _parse_tracks(lines: list[str]) -> list[_Track]:
    end = next((i for i, line in enumerate(lines) if line.startswith("[インフォメーション")), len(lines))
    lines = lines[:end]
    numbered = any(_TRACK.match(line) for line in lines)  # a digital single's is not
    tracks: list[_Track] = []
    for line in lines:
        number = _TRACK.match(line)
        if number or (not numbered and not line.startswith(_META)):
            track = _Track((number.group(1) if number else line).strip())
            if " / " in track.title:  # 「曲名 / 角色 (CV.声优)」
                title, singers = track.title.rsplit(" / ", 1)
                track.title, track.singers_text = title.strip(), singers.strip()
            tracks.append(track)
        elif not tracks:
            continue
        elif line.startswith("歌："):
            tracks[-1].singers_text = line.removeprefix("歌：").strip()
        elif (singers := tracks[-1].singers_text) and _unclosed(singers):  # broken mid-name
            tracks[-1].singers_text = singers + line
        elif singers and tracks[-1].group_members is None and "CV" in line and not line.startswith(_META):
            tracks[-1].group_members = line  # who the group on the 歌： line is
    for track in tracks:
        track.no_song = bool(_NO_SONG.search(track.title))
    return tracks


def _unclosed(text: str) -> bool:
    """Whether a list of singers goes on to the next line: broken off in a name, or after a
    comma."""
    opened = text.count("(") + text.count("（") > text.count(")") + text.count("）")
    return opened or text.rstrip().endswith(("、", ",", "，", "/", "／"))


def _text(raw: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", raw)).strip()


def _key(text: str) -> str:
    """A title for matching: `（2023 Ver.）` is `(2023Ver.)`, case aside."""
    return re.sub(r"[\W_]", "", unicodedata.normalize("NFKC", text)).casefold()


def _whole_cast(name: str) -> bool:
    """Whether `name` is the whole cast rather than a special unit: シャイニーカラーズ, with
    or without a head count after it (シャイニーカラーズ(28人), (25人・新))."""
    return re.sub(r"[（(][^（()）]*[)）]$", "", without_spaces(name)) == ALL_IDOLS


def _split(text: str, separators: str = "、/／×,，") -> list[str]:
    """`text`'s parts, split where no parenthesis is open."""
    parts, depth, current = [], 0, ""
    for char in text:
        depth += (char in "(（") - (char in ")）")
        if depth == 0 and char in separators:
            parts.append(current)
            current = ""
        else:
            current += char
    parts.append(current)
    return [part.strip() for part in parts if part.strip()]


class _Singers:
    """Tells which idols a singer the sources name stands for."""

    def __init__(self, roster: Roster) -> None:
        self._roster = roster

    def idol(self, name: str) -> str | None:
        """The idol a person named so is: by her name, or by her CV's in brackets."""
        match = re.match(r"^(.*?)\s*[（(]\s*CV\s*[.．:：]?\s*(.*?)\s*[)）]$", name)
        person, cv = (match.group(1), match.group(2)) if match else (name, None)
        return self._roster.idol(person, cv)

    def one(self, name: str, groups: dict[str, str]) -> tuple[list[str], str | None] | None:
        """The idols `name` stands for, and the special unit it is, if it is one."""
        if idol := self.idol(name):
            return [idol], None
        if unit := self._roster.unit(name):
            return list(unit.members), None
        if (listed := groups.get(without_spaces(name))) is not None:
            resolved = self.several(listed, {})
            if resolved and not resolved[2]:
                return resolved[0], None if _whole_cast(name) else name.strip()
        return None

    def is_unit_or_idol(self, names: Sequence[str]) -> bool:
        """Whether `names` are one idol, or exactly the members of one of the units."""
        return len(names) == 1 or any(set(names) == set(u.members) for u in self._roster.units)

    def several(self, text: str, groups: dict[str, str]) -> tuple[list[str], str | None, list[str]]:
        """The idols everyone `text` names stands for, the special unit among them, and
        those who stand for none."""
        names: list[str] = []
        special, bad = None, []
        for part in _split(text):
            found = self.one(part, groups)
            if found is None:
                bad.append(part)
                continue
            names += [name for name in found[0] if name not in names]
            special = special or found[1]
        return names, special, bad


def _version_singer(title: str, singers: _Singers) -> list[str] | None:
    """The idols of the version the title names (「曲名（櫻木真乃Ver.）」)."""
    match = _VERSION.search(title)
    if not match:
        return None
    who = (match.group(1) or match.group(2)).strip()
    for start in range(len(who)):  # the singer is the end of what comes before Ver.
        found = singers.one(who[start:].strip(), {})
        if found:
            return found[0]
    return None


def _resolve_from_lantis(releases: list[_Release], singers: _Singers) -> None:
    """Tells each track's singers as far as Lantis's pages do."""
    # title → singers → the page of the first release whose track says so
    said: dict[str, dict[tuple[str, ...], str]] = {}

    def same_title(
        release: _Release, track: _Track, told: dict[str, dict[tuple[str, ...], str]]
    ) -> None:
        """Takes the singers other tracks of the same title have, if they all agree,
        keeping the page of the one that says so as the source that tells them."""
        found = told.get(_key(track.title), {})
        if len(found) == 1:
            [(names, teller)] = found.items()
            track.singers = list(names)
            track.sources += [release.url, teller]

    for release in releases:
        groups = release.groups
        for track in release.tracks:
            if track.no_song:
                continue
            if track.singers_text:
                names, special, bad = singers.several(track.singers_text, groups)
                if bad:
                    track.bad, track.named = bad, names
                else:
                    track.singers, track.special = names, special
            elif (version := _version_singer(track.title, singers)) is not None:
                track.singers = version
            if track.singers is not None:
                track.sources.append(release.url)
                said.setdefault(_key(track.title), {}).setdefault(tuple(track.singers), release.url)
    for release in releases:
        for track in release.tracks:
            if _open(track) and not track.bad:
                same_title(release, track, said)
    told = {key: dict(value) for key, value in said.items()}
    for release in releases:
        artists = _split(release.artist, "、/／")
        open_tracks = [t for t in release.tracks if _open(t) and not t.bad]
        by_page = not any(t.singers_text for t in release.tracks)
        # A CD by several names each singing their own songs does not say who sings which,
        # but one whose other tracks are each one's version has a single song they share.
        if not open_tracks or not by_page or not (len(artists) == 1 or len(open_tracks) == 1):
            continue
        names, special, bad = singers.several(release.artist, release.groups)
        if bad:
            continue
        for track in open_tracks:
            track.singers, track.special = names, special
            track.sources.append(release.url)
            told.setdefault(_key(track.title), {}).setdefault(tuple(names), release.url)
    for release in releases:
        for track in release.tracks:
            if _open(track) and not track.bad:
                same_title(release, track, told)


def _listed_groups(releases: Iterable[_Release], singers: _Singers) -> set[str]:
    """The groups some release's page lists the idols of (Team.Stella under an アーティスト
    line), as `unit_key`s: Lantis's word that they are groups of idols."""
    return {
        unit_key(name) for release in releases for name, listed in release.groups.items()
        if not singers.several(listed, {})[2]
    }


# ふじわらはじめ


async def _fuji_songs(fetch: Fetch) -> dict[str, list[str]]:
    """ふじわらはじめ's Shiny Colors songs: the API URLs of each, by title."""

    try:
        rows = json.loads(await fetch(FUJI_SONGS_URL))
        songs: dict[str, list[str]] = {}
        for row in rows:
            songs.setdefault(_key(row["name"]), []).append(row["api"])
    except (ValueError, KeyError, TypeError) as e:
        raise WorldSyncError(f"{FUJI_SONGS_URL} 的回答不是预期的格式：{e!r}") from None
    if not songs:
        raise WorldSyncError(f"{FUJI_SONGS_URL} 没有返回任何歌曲")
    return songs


def _edition(title: str) -> str:
    """A release's title for matching across sources, without its edition (【初回限定盤】)."""
    return _key(re.sub(r"[【\[［][^】\]］]*[】\]］]", "", title))


def _bases(title: str) -> list[str]:
    keys = [_key(title)]
    for pattern in _BASE:
        base = pattern.sub("", title)
        if base != title:
            keys.append(_key(base))
    return keys


@dataclass
class _FanTrack:
    singers: list[str]
    unmatched: list[str]
    special: str | None
    """The special units ふじわらはじめ names, the whole cast and the units aside."""
    units: list[str]
    """Every group ふじわらはじめ names as singing it, as it spells them."""


class _Fuji:
    def __init__(
        self, fetch: Fetch, songs: dict[str, list[str]], singers: _Singers, groups: set[str],
        notes: list[str],
    ) -> None:
        self._fetch = fetch
        self._songs = songs
        self._singers = singers
        self._groups = groups
        """The groups Lantis lists the idols of somewhere, as `unit_key`s."""
        self._notes = notes
        self._json: dict[str, dict] = {}

    async def _get(self, url: str) -> dict:
        """The song or disc at `url`; empty if ふじわらはじめ answers with nothing, as it
        does for some discs whatever you ask (noted for the report)."""
        if url not in self._json:
            text = await self._fetch(url)
            if not text.strip():
                self._notes.append(f"{FUJI_NAME}的 {url} 返回了空内容，当作那里没有资料")
                self._json[url] = {}
                return self._json[url]
            try:
                data = json.loads(text)
            except ValueError as e:
                raise WorldSyncError(f"{url} 的回答不是预期的格式：{e!r}") from None
            if not isinstance(data, dict):
                raise WorldSyncError(f"{url} 的回答不是预期的格式")
            self._json[url] = data
        return self._json[url]

    async def _discs(self, release: _Release) -> list[dict]:
        """ふじわらはじめ's discs that are this release, found through its tracks' songs."""
        found: dict[str, dict] = {}
        for track in release.tracks:
            if not _open(track):
                continue
            for key in _bases(track.title):
                for api in self._songs.get(key, []):
                    song = await self._get(api)
                    for disc in song.get("disc") or []:
                        name, url = disc.get("name", ""), disc.get("api")
                        mine, theirs = _edition(release.title), _edition(name)
                        if not (url and mine and theirs):  # a disc without a name is no release
                            continue
                        if mine == theirs or mine.startswith(theirs) or theirs.startswith(mine):
                            found[url] = await self._get(url)
        return list(found.values())

    def _tracks(self, disc: dict) -> dict[str, list[_FanTrack]]:
        """The disc's sung tracks by title, versions for a game or without vocals aside."""
        tracks: dict[str, list[_FanTrack]] = {}
        for song in disc.get("song") or []:
            if {"offvocal", "gamever"} & set(song.get("flag") or []):
                continue
            names, unmatched, specials, units = [], [], [], []
            for unit in song.get("unit") or []:
                if name := unit.get("name"):
                    units.append(name)
                    if not _whole_cast(name) and not self._singers.one(name, {}):
                        specials.append(name)
                for member in unit.get("member") or []:
                    names.append(member.get("name", ""))
            names += [member.get("name", "") for member in song.get("member") or []]
            idols: list[str] = []
            for name in names:
                idol = self._singers.idol(name)
                if idol is None:
                    unmatched.append(name)
                elif idol not in idols:
                    idols.append(idol)
            if idols or unmatched:
                special = "、".join(specials) or None
                tracks.setdefault(_key(song.get("name", "")), []).append(
                    _FanTrack(idols, unmatched, special, units)
                )
        return tracks

    async def fill(self, release: _Release, result: ReleaseImport) -> None:
        for disc in await self._discs(release):
            link = disc.get("link") or disc.get("api", "")
            tracks = self._tracks(disc)
            for track in release.tracks:
                if track.no_song:
                    continue
                candidates = _same_song(tracks, track.title)
                if track.singers is not None:
                    self._compare(release, track, candidates, result)
                    continue
                distinct = {tuple(c.singers): c for c in candidates}
                if len(distinct) != 1:
                    continue
                fan = next(iter(distinct.values()))
                if fan.unmatched:
                    track.bad = track.bad or fan.unmatched
                    continue
                if track.bad:
                    # Lantis's word goes: ふじわらはじめ only tells who is in a group Lantis
                    # names without its idols, never who someone else Lantis names is.
                    if not self._tells_group(track, fan):
                        continue
                    special = "、".join(b for b in track.bad if not _whole_cast(b)) or None
                else:
                    special = fan.special or (
                        release.artist if _single_group(release, self._singers) else None
                    )
                    if special and self._singers.is_unit_or_idol(fan.singers):
                        special = None
                track.singers, track.special = fan.singers, special
                track.bad = []
                track.sources += [release.url, link]
                result.filled.append(
                    f"{release.catalog}「{track.title}」：{'、'.join(fan.singers)}（{link}）"
                )

    def _tells_group(self, track: _Track, fan: _FanTrack) -> bool:
        """Whether every singer Lantis names on the track but not among the idols is a
        group, whose idols ふじわらはじめ may then tell: the whole cast, one Lantis lists
        the idols of on some page, or one ふじわらはじめ names too. And whether every idol
        Lantis does name is among ふじわらはじめ's singers."""
        groups = self._groups | {unit_key(unit) for unit in fan.units}
        return (
            all(_whole_cast(b) or unit_key(b) in groups for b in track.bad)
            and set(track.named) <= set(fan.singers)
        )

    @staticmethod
    def _compare(release: _Release, track: _Track, fan: list[_FanTrack], result: ReleaseImport) -> None:
        distinct = {tuple(f.singers) for f in fan if not f.unmatched}
        if len(distinct) == 1 and set(next(iter(distinct))) != set(track.singers or []):
            result.conflicts.append(
                f"{release.catalog}「{track.title}」：Lantis 是 {'、'.join(track.singers or [])}，"
                f"{FUJI_NAME}是 {'、'.join(next(iter(distinct)))}"
            )


def _same_song(tracks: dict[str, list[_FanTrack]], title: str) -> list[_FanTrack]:
    """ふじわらはじめ's tracks on a disc that are the song Lantis titles so, under that
    title or, for a later version (-5 colors-, 2023 Ver.), under its first one."""
    return next((tracks[key] for key in _bases(title) if key in tracks), [])


def _single_group(release: _Release, singers: _Singers) -> bool:
    """Whether the release is by one group Lantis does not say the idols of, other than
    the whole cast."""
    artists = _split(release.artist, "、/／")
    return (
        len(artists) == 1 and "CV" not in artists[0] and not _whole_cast(artists[0])
        and singers.one(artists[0], release.groups) is None
    )


# Songs


def _assemble(releases: Iterable[_Release]) -> tuple[tuple[Release, ...], tuple[Song, ...]]:
    songs: dict[tuple[str, frozenset[str]], dict] = {}
    ids: set[str] = set()
    out: list[Release] = []
    for release in releases:
        tracks = []
        for track in release.tracks:
            if track.no_song or track.singers is None:
                tracks.append(Track(track.title, None))
                continue
            key = (_key(track.title), frozenset(track.singers))
            song = songs.get(key)
            if song is None:
                song_id, n = track.title, 1
                while song_id in ids:
                    n += 1
                    song_id = f"{track.title} #{n}"
                ids.add(song_id)
                song = songs[key] = {
                    "id": song_id, "title": track.title, "singers": tuple(track.singers),
                    "special_unit": track.special, "releases": [], "sources": [],
                }
            song["special_unit"] = song["special_unit"] or track.special
            if release.catalog not in song["releases"]:
                song["releases"].append(release.catalog)
            song["sources"] += [s for s in dict.fromkeys(track.sources) if s not in song["sources"]]
            tracks.append(Track(track.title, song["id"]))
        out.append(Release(release.catalog, release.title, release.date, tuple(tracks), (release.url,)))
    return tuple(out), tuple(
        Song(s["id"], s["title"], s["singers"], s["special_unit"], tuple(s["releases"]), tuple(s["sources"]))
        for s in songs.values()
    )
