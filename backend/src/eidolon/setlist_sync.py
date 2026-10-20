"""Importing what was performed on each live day, for `eidolon world sync` (`world_sync`).

The setlists come from imas-db's live records (`imas-db.jp/song/event/`): its index lists
every brand's lives, each marked with its brands' ids (Shiny Colors' is 8, a joint live
has several), and links to a page a day, or a page for the whole live. A page has a table
for each show, under a heading that names it (DAY1, 昼公演, a show's own name) or none.
Which day a show was on is told by the page's schedule (a show's name and its date), a
date in the show's own section, or the page's dates, one for each DAYn heading; a table
headed 全公演共通 is every show's, so every day's.

A day of the lives (`live_sync`) takes the setlist of the one show imas-db has on its
date. Where imas-db and the lives disagree (two shows on one day, a show on a day the
lives do not have, a show whose day cannot be told) nothing is guessed: the report lists
it, as it lists the days gone by that imas-db has no setlist for.

Each song's performers cell names the idols in several ways, all matched to the idol list
and the day's performers:

- 全員, or Shiny Colors as a whole: every idol who stood that day, but for those the page's
  cast marks ※ (she stood only on the songs that name her);
- a unit: its members who stood that day, those marked ※ again left out;
- an idol, by her name and CV: if she did not stand that day, or is none of the idols,
  she is left out and the report lists her;
- notes: (バックダンス: …) and ダンスパフォーマンスのみ make dancers, not singers; (…を含む)
  and (…を除く) add to and take from everyone; parts in the drama and guest appearances
  are neither.

Another brand's idols are not written. At a joint live, songs no idol of Shiny Colors took
part in are left out, and a song marked as another brand's (シンデレラ, IM@S) keeps that
brand: covering it does not make it a song of Shiny Colors (`World.songs` comes from the
releases alone). On a page of Shiny Colors' own, a song whose performers cannot be told
(a special unit named without its members) is kept without singers, and reported.
"""

import html
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from html.parser import HTMLParser
from typing import Literal

from eidolon.roster import Roster
from eidolon.sync_tools import Fetch, without_spaces
from eidolon.world import Live, LiveDay, SetlistItem, WorldSyncError

IMASDB = "https://imas-db.jp/song/event/"
BRAND_ID = "8"
_SHINY_COLORS = "シャイニーカラーズ"

_DATES = re.compile(
    r"(\d{4})/(\d{1,2})/(\d{1,2})(?:\s*\([^)]*\))?"
    r"((?:\s*[・〜~]\s*(?:\d{1,2}/)?\d{1,2}(?:\s*\([^)]*\))?)*)"
)
_MORE = re.compile(r"\s*([・〜~])\s*(?:(\d{1,2})/)?(\d{1,2})(?:\s*\([^)]*\))?")
_DAY_N = re.compile(r"DAY\s*(\d+)", re.I)
_TABLE = re.compile(r'<table class="tracklist".*?</table>', re.S)
_SECTION = re.compile(r'<div class="section"(?: data-brand-id="([^"]*)")?[^>]*>')
_EVERYONE = "全員"


@dataclass
class SetlistImport:
    lives: tuple[Live, ...]
    unmatched: list[str] = field(default_factory=list)
    """Performers of a song who are none of the idols: not written."""
    not_on_stage: list[str] = field(default_factory=list)
    """Idols named for a song who did not stand that day: not written."""
    mismatched: list[str] = field(default_factory=list)
    """Where imas-db's shows and the lives' days disagree: no setlist written."""
    missing: list[str] = field(default_factory=list)
    """Days gone by imas-db has no setlist for."""
    unknown_notes: list[str] = field(default_factory=list)
    """Notes naming idols that say something other than the notes understood."""


async def import_setlists(
    fetch: Fetch, lives: Sequence[Live], roster: Roster, today: date,
) -> SetlistImport:
    """`lives` with each day's setlist as imas-db has it now, the performers matched to the
    idols and units on `roster`. Raises WorldSyncError if any of its pages cannot be read."""
    entries = _index(await fetch(IMASDB))
    shows: list[_Show] = []
    read: set[str] = set()
    for joint, pages in entries:
        for file, dates in pages:
            if file in read:
                continue
            read.add(file)
            url = IMASDB + file
            shows += _page_shows(url, await fetch(url), dates, joint)
    return _assign(lives, shows, roster, today)


# The index


def _index(page: str) -> list[tuple[bool, list[tuple[str, list[date]]]]]:
    """Shiny Colors' lives on the index: whether each is a joint live, and its pages, each
    with the dates the index writes by it."""
    starts = [m for m in re.finditer(r'<li data-brand-ids="([^"]*)"', page)]
    if not starts:
        raise WorldSyncError(f"{IMASDB} 上找不到任何演出，页面结构可能变了")
    entries = []
    for m, end in zip(starts, [s.start() for s in starts[1:]] + [len(page)]):
        brands = [b.strip() for b in m.group(1).split(",")]
        if BRAND_ID not in brands:
            continue
        block = page[m.start():end]
        pages = []
        for link in re.finditer(r'<a href="\./([^"#]+\.html)(?:#[^"]*)?"', block):
            after = block[link.end():]
            day = re.match(r'[^<]*</a>\s*(?:<small class="caption">.*?</small>\s*)?<small class="date">([^<]*)</small>', after, re.S)
            pages.append((link.group(1), _dates(day.group(1)) if day else []))
        entries.append((brands != [BRAND_ID], pages))
    if not entries:
        raise WorldSyncError(f"{IMASDB} 上找不到闪耀色彩的演出，页面结构可能变了")
    return entries


def _dates(text: str) -> list[date]:
    """Every date in `text`: 2026/09/26(土)・27(日), a range 2026/04/11(土)〜12(日), each
    later date taking the year and month before it, into the next year if it comes earlier."""
    found: list[date] = []
    try:
        for match in _DATES.finditer(text):
            year, month, day = map(int, match.groups()[:3])
            last = date(year, month, day)
            found.append(last)
            for more in _MORE.finditer(match.group(4)):
                month = int(more.group(2)) if more.group(2) else month
                then = date(year, month, int(more.group(3)))
                if then <= last:  # past the month's or the year's end
                    if more.group(2):
                        year += 1
                    else:
                        month, year = (1, year + 1) if month == 12 else (month + 1, year)
                    then = date(year, month, then.day)
                if more.group(1) == "・":
                    found.append(then)
                else:
                    found += [last + timedelta(days=n) for n in range(1, (then - last).days + 1)]
                last = then
    except ValueError:
        raise WorldSyncError(f"imas-db 上的日期不存在：「{text.strip()}」") from None
    return found


# A page


@dataclass
class _Row:
    number: str
    title: str
    brand: str | None
    cell: str
    """The performers cell, as HTML."""


@dataclass
class _Show:
    url: str
    heading: str
    dates: list[date]
    """Its day, or every day for a setlist common to every show; empty if it cannot be told."""
    rows: list[_Row]
    common: bool
    """Whether it is every show's (全公演共通), giving way to a show of the day's own."""
    partial: set[str]
    """The title attributes (「櫻木真乃(CV:関根瞳)」) of performers who stood only on the songs
    naming them."""
    joint: bool


def _page_shows(url: str, page: str, index_dates: list[date], joint: bool) -> list[_Show]:
    start = page.find('id="page_title"')
    end = page.find('id="maruamyu-footer"')
    body = page[max(start, 0):end if end != -1 else len(page)]
    tables = list(_TABLE.finditer(body))
    outside = _TABLE.sub("", body)
    schedule = [
        (_text(label), _dates(day))
        for label, day in re.findall(r"<tr>\s*<td>([^<]*)</td>\s*<td>(\d{4}/[^<]*)</td>", outside)
    ]
    first = _DATES.search(body[:tables[0].start()] if tables else body)
    page_dates = _dates(first.group(0)) if first else index_dates
    partial = {
        html.unescape(title) for title in re.findall(
            r'<span [^>]*title="([^"]*)"[^>]*>[^<]*</span>\s*<small class="notes">\s*※\s*</small>', outside
        )
    }
    shows = []
    previous = 0
    for table in tables:
        before = body[:table.start()]
        sections = list(_SECTION.finditer(before))
        section = sections[-1] if sections else None
        brand = section.group(1) if section else None
        headings = re.findall(r"<h2[^>]*>(.*?)</h2>", before, re.S)
        heading = _text(re.sub(r"<[^>]+>", "", headings[-1])) if headings else ""
        own = body[max(previous, section.end() if section else 0):table.start()]
        previous = table.end()
        if brand and brand not in ("0", BRAND_ID) and BRAND_ID not in brand.split(","):
            continue  # another brand's stage on a page of several
        dates = _show_dates(heading, schedule, _dates(own), page_dates)
        common = "全公演共通" in heading
        shows.append(_Show(url, heading, dates, _rows(table.group(0)), common, partial, joint))
    return shows


def _show_dates(
    heading: str, schedule: list[tuple[str, list[date]]], own: list[date], page_dates: list[date],
) -> list[date]:
    for label, dates in schedule:
        if label and heading.startswith(label) and len(dates) == 1:
            return dates
    if len(own) == 1:
        return own
    if "全公演共通" in heading:
        return page_dates
    if (n := _DAY_N.search(heading)) and 0 < int(n.group(1)) <= len(page_dates):
        return [page_dates[int(n.group(1)) - 1]]
    return page_dates if len(page_dates) == 1 else []


def _rows(table: str) -> list[_Row]:
    """The songs of a setlist: rows numbered, not an MC or a heading."""
    rows = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 3 or not _text(cells[0]).isdigit():
            continue
        title_cell = cells[1]
        badge = re.search(r'<small class="badge[^"]*"[^>]*title="([^"]*)"', title_cell)
        brand = html.unescape(badge.group(1)) if badge else None
        bare = re.sub(r'<small class="badge.*?</small>|<span class="visually-hidden">.*?</span>', "", title_cell, flags=re.S)
        title = _text(re.sub(r"<[^>]+>", " ", bare))
        rows.append(_Row(_text(cells[0]), title, None if brand == _SHINY_COLORS else brand, cells[-1]))
    return rows


# A performers cell


@dataclass
class _Token:
    kind: Literal["idol", "unit", "brand", "text"]
    text: str
    title: str = ""
    shiny: bool = False
    """Whether the page marks it as Shiny Colors'."""


@dataclass
class _Note:
    text: str
    tokens: list[_Token]


class _Cell(HTMLParser):
    """Reads a performers cell into its performers and its notes, each note with the
    performers it names."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[_Token] = []
        self.notes: list[_Note] = []
        self._note_depth = 0
        self._span: _Token | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: v or "" for k, v in attrs}
        classes = a.get("class", "").split()
        if self._note_depth:
            self._note_depth += 1
        elif "notes" in classes:
            self._note_depth = 1
            self.notes.append(_Note(a.get("title", ""), []))
            return
        if tag != "span" or not classes:
            return
        cls = classes[0]
        if cls == "idol-name":
            shiny = a.get("data-brand-id") == BRAND_ID
            kind: Literal["idol", "unit", "brand", "text"] = (
                "idol" if "data-character-id" in a or "title" in a
                else "unit" if "data-group-id" in a
                else "brand" if "data-brand-id" in a
                else "text"
            )
        elif cls.startswith("idol_sc_"):
            shiny, kind = True, "unit" if cls.startswith("idol_sc_unit") else "idol"
        else:
            return
        self._span = _Token(kind, "", a.get("title", ""), shiny)

    def handle_endtag(self, tag: str) -> None:
        if self._span is not None and tag == "span":
            (self.notes[-1].tokens if self._note_depth else self.tokens).append(self._span)
            self._span = None
        if self._note_depth:
            self._note_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._span is not None:
            self._span.text += data
        elif self._note_depth:
            self.notes[-1].text += data
        elif data.strip():
            self.tokens.append(_Token("text", data))


def _idol(roster: Roster, title: str, text: str = "") -> str | None:
    """The idol imas-db means: the name in the title attribute 「櫻木真乃(CV:関根瞳)」, else
    its voice actor; without a title, the text shown, a name or a voice actor's name."""
    cv = re.search(r"CV[:：]\s*([^)）]+)", title)
    return roster.idol(_name(title) if title else text, cv.group(1) if cv else text)


def _sort(roster: Roster, names: Iterable[str]) -> tuple[str, ...]:
    """In the roster's order of the idols."""
    order = {name: n for n, name in enumerate(roster.idols)}
    return tuple(sorted(set(names), key=lambda name: order.get(name, len(order))))


def _resolve(song: str, row: _Row, show: _Show, day: LiveDay, roster: Roster, report: SetlistImport) -> SetlistItem | None:
    """The song as it was performed on `day`, those in its performers cell who cannot be
    written going to `report` under `song`; None for a song at a joint live that none of
    Shiny Colors' idols took part in."""
    cell = _Cell()
    cell.feed(row.cell)
    cell.close()
    partial = {_idol(roster, title) for title in show.partial}
    stood = [name for name in day.performers if name not in partial]
    unmatched: list[str] = []
    not_on_stage: list[str] = []

    def named(tokens: list[_Token], everyone: bool) -> set[str]:
        """The idols `tokens` name; 全員 among them only if `everyone`."""
        found: set[str] = set()
        for token in tokens:
            text = _text(token.text)
            if token.kind == "text":
                if everyone and text.startswith(_EVERYONE):
                    found.update(stood)
            elif not token.shiny:
                continue
            elif token.kind == "brand":
                found.update(stood)
            elif token.kind == "unit":
                if (unit := roster.unit(token.text)) is not None:
                    found.update(name for name in unit.members if name in stood)
                else:
                    unmatched.append(text)  # a special unit, its members not named
            elif (idol := _idol(roster, token.title, token.text)) is None:
                unmatched.append(_name(token.title) if token.title else text)
            elif idol not in day.performers:
                not_on_stage.append(idol)
            else:
                found.add(idol)
        return found

    singers = named(cell.tokens, everyone=True)
    dancers: set[str] = set()
    for note in cell.notes:
        if "ダンスパフォーマンスのみ" in note.text:
            dancers |= singers
            singers = set()
        elif not note.tokens:
            continue
        elif "バックダンス" in note.text:
            dancers |= named(note.tokens, everyone=False)
        elif "を除く" in note.text:
            singers -= named(note.tokens, everyone=False)
        elif "を含む" in note.text:
            singers |= named(note.tokens, everyone=False)
        elif not any(word in note.text for word in ("演劇パート", "友情出演")):
            if any(t.shiny for t in note.tokens):
                report.unknown_notes.append(f"{song}：{_text(note.text)}")
    if not singers and not dancers and not unmatched and not not_on_stage and not show.joint:
        # Only plain text names them (a special unit, someone who is no idol).
        unmatched += [
            text for token in cell.tokens
            if token.kind == "text" and (text := _text(re.sub(r"[,、，×/+()（）]", " ", token.text)))
            and not text.startswith(_EVERYONE)
        ]
    report.unmatched += [f"{song}：{name}" for name in unmatched]
    report.not_on_stage += [f"{song}：{name}" for name in not_on_stage]
    if not singers and not dancers and show.joint:
        return None  # another brand's song, or one none of hers took part in
    return SetlistItem(row.title, _sort(roster, singers), _sort(roster, dancers - singers), row.brand)


# Days


def _assign(lives: Sequence[Live], shows: list[_Show], roster: Roster, today: date) -> SetlistImport:
    result = SetlistImport(())
    by_day: dict[date, list[_Show]] = {}
    for show in shows:
        if not show.dates:
            result.mismatched.append(f"imas-db 上看不出是哪一天的公演：{show.url}（{show.heading or '没有标题'}）")
        for day in show.dates:
            by_day.setdefault(day, []).append(show)
    ours = {day.date for live in lives for day in live.days}
    for day, on in sorted(by_day.items()):
        if day not in ours:
            urls = "、".join(dict.fromkeys(show.url for show in on))
            result.mismatched.append(f"imas-db 上有 {day.isoformat()} 的公演，资料里的演出没有这一天：{urls}")
    written = []
    for live in lives:
        days = []
        for day in live.days:
            where = f"{live.name} {day.date.isoformat()}"
            on = by_day.get(day.date, [])
            on = [show for show in on if not show.common] or on
            if len(on) > 1:
                headings = "、".join(show.heading or "没有标题" for show in on)
                urls = "、".join(dict.fromkeys(show.url for show in on))
                result.mismatched.append(
                    f"{where}：imas-db 上这一天有 {len(on)} 场公演（{headings}），资料里是一个演出日：{urls}"
                )
            elif not on:
                if day.date <= today:
                    result.missing.append(where)
            else:
                day = _with_setlist(where, day, on[0], roster, result)
            days.append(day)
        written.append(replace(live, days=tuple(days)))
    result.lives = tuple(written)
    return result


def _with_setlist(where: str, day: LiveDay, show: _Show, roster: Roster, result: SetlistImport) -> LiveDay:
    items = []
    for row in show.rows:
        item = _resolve(f"{where} 第 {row.number} 首「{row.title}」", row, show, day, roster, result)
        if item is not None:
            items.append(item)
    if not items:
        return day
    return replace(day, setlist=tuple(items), sources=tuple(dict.fromkeys([*day.sources, show.url])))


# Text


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(fragment).replace("　", " ")).strip()


def _name(title: str) -> str:
    """The idol's name out of imas-db's 「櫻木真乃(CV:関根瞳)」, without spaces."""
    return without_spaces(re.split(r"[(（]", html.unescape(title), maxsplit=1)[0])
