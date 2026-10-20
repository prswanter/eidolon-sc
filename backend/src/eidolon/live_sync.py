"""Importing the lives and who stood on each day, for `eidolon world sync` (`world_sync`).

Which lives there are, their names, days and venues, the official sites say:

- the idolmaster portal's CMS API, from the day it began (2020-09): a token first, then
  every article in the LIVE-EVENT category, kept if one of its brands is SHINYCOLORS
  (joint lives have several). Each day and its venue comes from the article's display
  text (`event_dspdate`, `event_place`), a tour's lines headed by the city.
- before that, the old official site's event pages, one a year (`idolmaster.jp/event/
  2019.php`), which list every brand's events with no brand to tell them apart.

Neither tells a live from the other things in its lists (hotel tie-ins, exhibitions, a
TV show, an exam) nor who stood on which day. The fan wiki's live pages (wikiwiki's
「ライブイベント情報」 and the yearly logs it links to) list Shiny Colors' lives only,
each with its performers by day, 「声优（角色役）」 or, for an xR live, the idol alone.
So an official entry is a live if one of its days is a day of one of the wiki's lives,
and each of its days takes that day's performers there, matched to the idols by the
role, or failing that by the CV; the dates and venues stay the official ones. Official
entries the wiki has no day of, and the wiki's lives no official entry has a day of
(guest appearances at other festivals, one announced too lately for the CMS to list),
are left out and listed in the report, as are lives the wiki calls off (開催中止,
出演見送り, 出演中止).

A performer the wiki strikes out, with a footnote saying 出演見合わせ, did not stand on
that day, if the footnote links to the official news: she is left out of the day's
performers and kept among its absent. Without such a link the absence is not taken, and
the report lists it. Performers who are none of the idols (another brand's, a host) are
not written; the report lists them, save the office's clerk, who sometimes hosts.

What the deployer has checked by hand (`LiveCorrections`) goes over all of it: who stood
on a day the wiki has wrong or not at all, and which of its performers are no idols.
"""

import html
import json
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from difflib import SequenceMatcher
from urllib.parse import quote, unquote, urlencode

from eidolon.roster import Roster, person_key
from eidolon.sync_tools import Fetch, without_spaces
from eidolon.world import Idol, Live, LiveDay, WorldSyncError

CMS_API = "https://cmsapi-frontend.idolmaster-official.jp/sitern/api/"
CMS_TOKEN_URL = CMS_API + "cmsbase/Token/get"
CMS_LIST_URL = CMS_API + "idolmaster/Article/list"
PORTAL = "https://idolmaster-official.jp/"
OLD_SITE = "https://idolmaster.jp/event/"
OLD_SITE_FIRST_YEAR = 2018
"""The year Shiny Colors began: the old site's pages before it have none of its lives."""
WIKI = "https://wikiwiki.jp/shinycolors/"
WIKI_PAGE = "ライブイベント情報"
BRAND = "SHINYCOLORS"
_PAGE_SIZE = 100

_DATE = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
_MORE_DAYS = re.compile(r"^\s*(?:\([^)]*\)|（[^）]*）)?\s*[、・,]\s*(\d{1,2})\s*日")
"""A further day in the same month after a date: 「2027年6月5日(土)、6日(日)」."""
_POSTPONED = re.compile(r"^[(（]延期公演[)）]")
_CALLED_OFF = re.compile(r"^[(（][^)）]*(?:中止|見送り)[^)）]*[)）]")
_ROLE = re.compile(r"^(.*?)\s*[（(]\s*(.+?)\s*役\s*[）)]$")
_OFFICIAL_NEWS = re.compile(r"https?://(?:idolmaster-official\.jp/news/|idolmaster\.jp/blog/)[^\s\"'<>]+")
_NOTE = re.compile(r'<a\b[^>]*class="note_super[^"]*"[^>]*>\s*\*\d+\s*</a>')
_LABELS = ("公演名", "出演形態", "開催日時", "会場", "有料生配信", "チケット料金", "出演者")


@dataclass
class LiveImport:
    lives: tuple[Live, ...]
    unmatched: list[str] = field(default_factory=list)
    """Performers who are none of the idols: not written."""
    unlinked_absences: list[str] = field(default_factory=list)
    """Performers the wiki strikes out without an absence it links official news for:
    still taken as standing on the day."""
    conflicts: list[str] = field(default_factory=list)
    """Days the wiki lists performers on that the official list does not have."""
    official_only: list[str] = field(default_factory=list)
    """Official entries none of whose days the wiki has a live on: not written."""
    wiki_only: list[str] = field(default_factory=list)
    """The wiki's lives no official entry has a day of: not written."""
    called_off: list[str] = field(default_factory=list)
    """Lives the wiki says were called off, or Shiny Colors pulled out of: not written."""
    no_performers: list[str] = field(default_factory=list)
    """Days of a live the wiki lists no performers for."""
    corrected: list[str] = field(default_factory=list)
    """Days whose performers the corrections set."""
    unused_corrections: list[str] = field(default_factory=list)
    """Corrections no day of any live matched."""


@dataclass(frozen=True)
class DayCorrection:
    performers: tuple[str, ...]
    sources: tuple[str, ...]
    note: str


@dataclass
class LiveCorrections:
    """What the deployer has found out by hand, kept beside the data file
    (`world-corrections.json`) and applied on every import: who stood on a day, whatever
    the wiki says (a day it has the wrong list for, or none: an empty list says nobody
    did), and names among the wiki's performers who are no idols (hosts), not to be
    reported again."""

    days: dict[tuple[str, date], DayCorrection] = field(default_factory=dict)
    """By the live's official name and the day."""
    not_idols: set[str] = field(default_factory=set)
    """Names as the roster compares them (`person_key`)."""

    @classmethod
    def from_json(cls, data: dict, idols: Iterable[Idol], where: str) -> "LiveCorrections":
        """Raises WorldSyncError, naming `where`, if it is malformed or names someone
        who is none of the idols."""
        names = {idol.name for idol in idols}
        corrections = cls()
        try:
            for day in data.get("live_days", []):
                strangers = [name for name in day["performers"] if name not in names]
                if strangers:
                    raise WorldSyncError(
                        f"{where} 里 {day['live']} {day['date']} 的出演者不在偶像名单里：{'、'.join(strangers)}"
                    )
                corrections.days[(day["live"], date.fromisoformat(day["date"]))] = DayCorrection(
                    tuple(day["performers"]), tuple(day["sources"]), day.get("note", ""),
                )
            corrections.not_idols = {person_key(entry["name"]) for entry in data.get("not_idols", [])}
        except (KeyError, TypeError, ValueError, AttributeError) as e:
            raise WorldSyncError(f"{where} 缺少或写错了字段：{e!r}") from None
        return corrections


async def import_lives(
    fetch: Fetch, roster: Roster, corrections: LiveCorrections | None = None,
) -> LiveImport:
    """The lives as the official sites and the wiki have them now, the performers matched
    to the idols on `roster`, `corrections` applied. Raises WorldSyncError if any of them
    cannot be read."""
    official = await _cms_lives(fetch)
    if not any(entry.days for entry in official):
        raise WorldSyncError(f"{CMS_LIST_URL} 的演出一个演出日也读不出来，日期的写法可能变了")
    first = min(day.date for entry in official for day in entry.days)
    for year in range(OLD_SITE_FIRST_YEAR, first.year + 1):
        page_url = f"{OLD_SITE}{year}.php"
        official += [
            entry for entry in _old_site_entries(page_url, await fetch(page_url))
            if max(day.date for day in entry.days) < first
        ]
    wiki = await _wiki_lives(fetch)
    return _merge(official, wiki, roster, corrections or LiveCorrections())


# The official lists


@dataclass
class _Day:
    date: date
    venue: str


@dataclass
class _Official:
    name: str
    days: list[_Day]
    source: str
    old: bool = False
    """From the old site, which lists every brand's events."""


async def _cms_lives(fetch: Fetch) -> list[_Official]:
    token = _cms_data(await fetch(CMS_TOKEN_URL), CMS_TOKEN_URL)
    if not isinstance(token, dict) or not token.get("token"):
        raise WorldSyncError(f"{CMS_TOKEN_URL} 没有给出 token")
    articles: list[dict] = []
    while True:
        query = {
            "site": "jp", "ip": "idolmaster", "token": token["token"],
            "data": json.dumps({"category": ["LIVE-EVENT"]}),
            "limit": _PAGE_SIZE, "start": len(articles),
        }
        url = f"{CMS_LIST_URL}?{urlencode(query)}"
        page = _cms_data(await fetch(url), CMS_LIST_URL)
        try:
            total, found = int(page["total_count"]), page["article_list"]
        except (KeyError, TypeError, ValueError) as e:
            raise WorldSyncError(f"{CMS_LIST_URL} 的回答不是预期的格式：{e!r}") from None
        articles += found
        if not found or len(articles) >= total:
            break
    lives = []
    for article in articles:
        brands = {brand.get("code") for brand in article.get("brand") or []}
        if BRAND not in brands or article.get("article_type") == "lp_detail":
            continue
        days = _cms_days(article.get("event_dspdate") or "", article.get("event_place") or "")
        lives.append(_Official(_clean(article.get("title") or ""), days, _cms_source(article)))
    if not lives:
        raise WorldSyncError(f"{CMS_LIST_URL} 的 LIVE-EVENT 里没有闪耀色彩的演出，接口可能变了")
    return [live for live in lives if live.days] + [live for live in lives if not live.days]


def _cms_data(text: str, url: str):
    """The `data` of a CMS answer, which says it failed in its body, not its status."""
    try:
        answer = json.loads(text)
    except ValueError as e:
        raise WorldSyncError(f"{url} 的回答不是 JSON：{e!r}") from None
    if not isinstance(answer, dict) or answer.get("statusCode") != 200 or not answer.get("data"):
        raise WorldSyncError(f"{url} 回答失败：{text[:200]}")
    return answer["data"]


def _cms_source(article: dict) -> str:
    if article.get("article_type") == "detail_page" and article.get("url_name"):
        return f"{PORTAL}live_events/{article['url_name']}"
    url = article.get("event_url") or f"{PORTAL}live_event/"
    return re.sub(r"(?<!:)//+", "/", url)


def _cms_days(dspdate: str, place: str) -> list[_Day]:
    """Each day the display text names, at the venue of the city heading its line."""
    places = [line.strip() for line in place.splitlines() if line.strip()]
    venues: dict[str, str] = {}
    for line in places:
        if match := re.match(r"^(.+?)\s*[：:]\s*(.+)$", line):
            venues[without_spaces(match.group(1))] = match.group(2).strip()
    days = []
    for line in dspdate.splitlines():
        venue = places[0] if places else ""
        if (match := re.match(r"^(.+?)\s*[：:]", line)) and without_spaces(match.group(1)) in venues:
            venue = venues[without_spaces(match.group(1))]
        days += [_Day(day, venue) for day in _dates(line)]
    return days


def _dates(text: str) -> list[date]:
    """Every date in `text`, those after 「、」 or 「・」 taking the year and month before."""
    found = []
    try:
        for match in _DATE.finditer(text):
            year, month, day = map(int, match.groups())
            found.append(date(year, month, day))
            rest = text[match.end():]
            while more := _MORE_DAYS.match(rest):
                found.append(date(year, month, int(more.group(1))))
                rest = rest[more.end():]
    except ValueError:
        raise WorldSyncError(f"日期不存在：「{text.strip()}」") from None
    return found


def _old_site_entries(url: str, page: str) -> list[_Official]:
    """The old site's events of one year: every brand's, each with its name, days and
    venue."""
    if 'class="eventCont"' not in page:
        raise WorldSyncError(f"{url} 上找不到任何演出，页面结构可能变了")
    entries = []
    for block in page.split('class="eventCont"')[1:]:
        cells = dict(re.findall(r"<th>\s*(\S+?)\s*</th>\s*<td>(.*?)(?=<th>|</table>\s*</div>)", block, re.S))
        name = " ".join(_lines(cells.get("公演名", "")))
        days = _dates(" ".join(_lines(cells.get("日時", ""))))
        venue = " ".join(_lines(cells.get("場所", "")))
        link = re.search(r'href="(https?://[^"]+)"', cells.get("リンク", ""))
        if name and days:
            source = link.group(1) if link else url
            entries.append(_Official(name, [_Day(day, venue) for day in days], source, old=True))
    return entries


# The wiki


@dataclass
class _Performer:
    name: str
    """As the wiki writes it, CV and role, or the idol alone."""
    role: str | None
    cv: str | None
    struck: bool = False
    note: str | None = None
    """The footnote after a struck performer, as text."""
    news: list[str] = field(default_factory=list)
    """The official news the footnote links to."""
    among_roles: bool = False
    """Whether others on its line are written with their roles: a name without one
    there is someone (a host), not a heading."""


@dataclass
class _WikiLive:
    title: str
    url: str
    """The wiki page it is on."""
    names: list[str] = field(default_factory=list)
    """Its full names (公演名), the tour's legs' included."""
    days: dict[date, list[_Performer]] = field(default_factory=dict)
    dates: set[date] = field(default_factory=set)
    """Its days: those under 開催日時 and those its performers are listed by."""

    @property
    def called_off(self) -> bool:
        return bool(_CALLED_OFF.match(self.title))


async def _wiki_lives(fetch: Fetch) -> list[_WikiLive]:
    main = WIKI + quote(WIKI_PAGE)
    first = await fetch(main)
    logs = []
    for href in re.findall(r'href="(/shinycolors/[^"#]+)"', first):
        page = unquote(href).removeprefix("/shinycolors/")
        if re.fullmatch(re.escape(WIKI_PAGE) + r"/開催情報log\d+", page) and page not in logs:
            logs.append(page)
    lives = _wiki_page(main, first)
    for page in sorted(logs):
        url = WIKI + quote(page)
        lives += _wiki_page(url, await fetch(url))
    return lives


def _wiki_page(url: str, page: str) -> list[_WikiLive]:
    starts = [m.start() for m in re.finditer(r'<div class="accordion-container', page)]
    if not starts:
        raise WorldSyncError(f"{url} 上找不到任何演出，页面结构可能变了")
    lives = []
    for start, end in zip(starts, starts[1:] + [len(page)]):
        block = page[start:end]
        for stop in ("<h2", 'id="main-contents-bottom"'):  # the page goes on after its last live
            if (at := block.find(stop)) != -1:
                block = block[:at]
        header = re.search(r'class="accordion-header">(.*?)</h3>', block, re.S)
        if header is None:
            continue
        live = _WikiLive(_clean(re.sub(r"<[^>]+>", "", header.group(1))), url)
        _read_block(block[header.end():], live)
        lives.append(live)
    return lives


def _read_block(block: str, live: _WikiLive) -> None:
    """Reads the dates and each day's performers out of a live's entry. A performers list
    without dates, or under a label that is no date (昼公演, a tour's city), holds for
    every day of the dates listed last before it."""
    notes: list[str] = []

    def strike(match: re.Match) -> str:
        tooltip = re.search(r'data-tooltip-content="([^"]*)"', match.group(2) or "")
        notes.append(html.unescape(tooltip.group(1)) if tooltip else "")
        return f"{match.group(1)}\x00{len(notes) - 1}\x00"

    block = re.sub(
        r"<del>(.*?)</del>\s*(" + _NOTE.pattern + r")?", strike, block, flags=re.S
    )
    block = _NOTE.sub("", block)
    section, scope, day = None, [], None
    for line in _lines(block):
        label = next((label for label in _LABELS if re.match(label + r"(?:$|[\s(（])", line)), None)
        if label:
            section, day = label, None
            if label == "開催日時":
                scope = []
            continue
        if section == "公演名":
            live.names.append(line)
        elif section == "開催日時":
            dates = _dates(line)
            live.dates.update(dates)
            scope += dates
        elif section == "出演者":
            if _DATE.match(line):
                day = _dates(line)[0]
                live.dates.add(day)
                continue
            performers = _performers(line, notes)
            if performers:
                for on in [day] if day else scope:
                    live.days.setdefault(on, []).extend(performers)


def _performers(line: str, notes: list[str]) -> list[_Performer]:
    found: list[_Performer] = []
    for part in line.split("/"):
        text = re.sub(r"\*\d+", "", part).strip()
        struck = re.search(r"\x00(\d+)\x00", text)
        text = re.sub(r"\x00\d+\x00", "", text).strip()
        if not text:
            continue
        performer = _Performer(text, None, None)
        if match := _ROLE.match(text):
            performer.cv, performer.role = match.group(1).strip() or None, match.group(2)
        if struck:
            note = notes[int(struck.group(1))]
            performer.struck = True
            performer.note = " ".join(_lines(note))
            performer.news = list(dict.fromkeys(_OFFICIAL_NEWS.findall(note)))
        found.append(performer)
    among_roles = any(performer.role for performer in found)
    for performer in found:
        performer.among_roles = among_roles
    return found


# Merging


def _idol(roster: Roster, performer: _Performer) -> str | None:
    """The idol a performer is: by the role if one is written (else by the voice actor),
    otherwise by the one name written."""
    if performer.role is not None:
        return roster.idol(performer.role, performer.cv)
    return roster.idol(performer.name)


def _is_someone(roster: Roster, performer: _Performer) -> bool:
    """Whether an unmatched performer is worth reporting: not the clerk hosting, and
    not a heading (a unit's name, 昼公演) among the performers."""
    if performer.role is not None:
        return not roster.is_staff(performer.role)
    return performer.among_roles and not roster.is_staff(performer.name)


def _merge(
    official: list[_Official], wiki: list[_WikiLive], roster: Roster,
    corrections: LiveCorrections,
) -> LiveImport:
    result = LiveImport(())
    matched: set[int] = set()
    official_days: dict[int, set[date]] = {}
    """The official days of the entries each wiki live was matched to."""
    lives = []
    for entry in official:
        dates = {day.date for day in entry.days}
        candidates = [
            (len(dates & live.dates), _likeness(entry.name, live), n)
            for n, live in enumerate(wiki) if dates & live.dates
        ]
        if entry.old:
            # Every brand's events, one on the day of a live maybe another's; and the
            # CMS's entries come first, so a live they have is one put off to their day.
            candidates = [c for c in candidates if c[1] >= _LIKE and c[2] not in matched]
        if not candidates:
            if entry.old:
                continue
            when = "、".join(d.isoformat() for d in sorted(dates)) or "没有写演出日"
            result.official_only.append(f"{entry.name}（{when}）：{entry.source}")
            continue
        *_, n = max(candidates)
        live = wiki[n]
        matched.add(n)
        if live.called_off:
            result.called_off.append(f"{entry.name}（wiki 上是「{live.title}」）")
            continue
        official_days.setdefault(n, set()).update(dates)
        lives.append(_live(entry, live, roster, corrections, result))
    for n, days in official_days.items():
        for extra in sorted(set(wiki[n].days) - days):
            if _POSTPONED.match(wiki[n].title) and extra < min(days):
                continue  # the days it was first to be on
            result.conflicts.append(
                f"{wiki[n].title}：wiki 上 {extra.isoformat()} 有出演者，官方没有这一天（按官方写入）：{wiki[n].url}"
            )
    for n, live in enumerate(wiki):
        if n not in matched:
            (result.called_off if live.called_off else result.wiki_only).append(
                f"{live.title}（{'、'.join(d.isoformat() for d in sorted(live.dates)) or '没有写日期'}）：{live.url}"
            )
    result.lives = tuple(sorted(lives, key=lambda live: (live.days[0].date, live.name)))
    written = {(live.name, day.date) for live in result.lives for day in live.days}
    result.unused_corrections = [
        f"{name} {day.isoformat()}" for name, day in corrections.days if (name, day) not in written
    ]
    return result


def _live(
    entry: _Official, wiki: _WikiLive, roster: Roster, corrections: LiveCorrections,
    result: LiveImport,
) -> Live:
    days = []
    for day in sorted(entry.days, key=lambda day: day.date):
        where = f"{entry.name} {day.date.isoformat()}"
        if (corrected := corrections.days.get((entry.name, day.date))) is not None:
            result.corrected.append(f"{where}：{corrected.note or '、'.join(corrected.sources)}")
            days.append(LiveDay(day.date, day.venue, corrected.performers, (), corrected.sources))
            continue
        on = wiki.days.get(day.date, [])
        if not on:
            result.no_performers.append(f"{where}：{wiki.url}")
        stood: list[str] = []
        absent: list[str] = []
        sources = [wiki.url]
        for performer in on:
            idol = _idol(roster, performer)
            if idol is None:
                if _is_someone(roster, performer) and person_key(performer.name) not in corrections.not_idols:
                    result.unmatched.append(f"{where}：{performer.name}")
                continue
            if performer.struck:
                if performer.news and "見合わせ" in (performer.note or ""):
                    absent.append(idol)
                    sources += performer.news
                    continue
                result.unlinked_absences.append(
                    f"{where}：{performer.name}（{performer.note or '没有脚注'}）"
                )
            if idol not in stood:
                stood.append(idol)
        stood = [idol for idol in stood if idol not in absent]
        if on and not stood and not absent:
            result.no_performers.append(f"{where}：{wiki.url}（名单里没有对应得上的偶像）")
        days.append(LiveDay(
            day.date, day.venue, tuple(stood), tuple(dict.fromkeys(absent)),
            tuple(dict.fromkeys(sources)),
        ))
    return Live(entry.name, tuple(days), (entry.source, wiki.url))


_LIKE = 0.6


def _likeness(name: str, live: _WikiLive) -> float:
    """How like one of the wiki live's names the official name is, from 0 to 1."""
    mine = _comparable(name)
    best = 0.0
    for other in [live.title, *live.names]:
        theirs = _comparable(_CALLED_OFF.sub("", other))
        if mine and theirs and (mine in theirs or theirs in mine):
            return 1.0
        best = max(best, SequenceMatcher(None, mine, theirs).ratio())
    return best


# Text


def _comparable(text: str) -> str:
    return re.sub(r"[\W_]", "", unicodedata.normalize("NFKC", text)).casefold()



def _lines(fragment: str) -> list[str]:
    text = re.sub(r"<br\b[^>]*>", "\n", fragment)
    text = re.sub(r"</?(?:p|h\d|div|li|ul|tr|td|th|table|blockquote)\b[^>]*>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    lines = html.unescape(text).replace("　", " ").splitlines()
    return [re.sub(r"\s+", " ", line).strip() for line in lines if line.strip()]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text).replace("　", " ")).strip()
