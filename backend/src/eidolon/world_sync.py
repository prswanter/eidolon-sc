"""Importing the world setting: `eidolon world sync`.

The idols, their readings and CVs, and the office's president and clerk come from
im@sparql's SPARQL endpoint, asked for the brand `"ShinyColors"@en`. Which units there
are, and who is in each, the official site's unit pages decide (ADR-0008): im@sparql
also lists special units put together for a release or a project (Team.Stella and the
like), which are not units, so they are left out and only named in the report. A unit
takes its reading from the im@sparql unit of the same name, or failing that of the same
members.

Where the two sources disagree (a member on one side only, a unit im@sparql lacks, an
idol in none of the units) the official pages win, and the report lists it for the
deployer to look into.

The releases and their songs come from Lantis, with ふじわらはじめ filling in the
singers Lantis leaves out (`release_sync`); the report lists what it filled in, where
it disagrees with Lantis, and the tracks whose singers are none of the idols or unknown.

The lives come from the idolmaster portal's CMS API and, before it began, the old
official site, with who stood on each day from the fan wiki (`live_sync`); the report
lists what it could not tell: absences the wiki gives no official news for, performers
who are none of the idols, entries one side has and the other does not.

What was performed on each live day comes from imas-db's live records (`setlist_sync`);
the report lists the performers it could not match and the days imas-db and the lives
disagree on, which are left without a setlist rather than guessed.

The report also counts each kind of entry and what was added or removed since the last
import, so that the deployer can read it beside the git diff before committing the file.

Every source has to answer: if any fails, the import fails and the old file stays as
it was. The file is replaced whole, once everything is in.
"""

import html
import json
import os
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import httpx

from eidolon.live_sync import LiveCorrections, LiveImport, import_lives
from eidolon.release_sync import FUJI_NAME, ReleaseImport, TrackCorrections, import_releases
from eidolon.roster import Roster, person_key, unit_key
from eidolon.setlist_sync import SetlistImport, import_setlists
from eidolon.sync_tools import without_spaces
from eidolon.world import Idol, Staff, Unit, World, WorldError, WorldSyncError, load_world

SPARQL_URL = "https://sparql.crssnky.xyz/spql/imas/query"
OFFICIAL_URL = "https://shinycolors.idolmaster-official.jp/idol/"
_USER_AGENT = "eidolon-sc world sync (run by hand)"
CORRECTIONS_FILE = "world-corrections.json"
"""The deployer's corrections, beside the data file (`release_sync.TrackCorrections`,
`live_sync.LiveCorrections`)."""

_PREFIXES = """PREFIX schema: <http://schema.org/>
PREFIX imas: <https://sparql.crssnky.xyz/imasrdf/URIs/imas-schema.ttl#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
"""
_IDOLS_QUERY = _PREFIXES + """SELECT ?idol ?name ?kana ?cv WHERE {
  ?idol imas:Brand "ShinyColors"@en ; rdf:type imas:Idol ; schema:name ?name .
  FILTER(lang(?name) = "ja")
  OPTIONAL { ?idol imas:nameKana ?kana }
  OPTIONAL { ?idol imas:cv ?cv . FILTER(isLiteral(?cv) && lang(?cv) = "ja") }
}"""
_STAFF_QUERY = _PREFIXES + """SELECT ?staff ?name ?kana ?position ?officeName WHERE {
  ?staff imas:Brand "ShinyColors"@en ; rdf:type imas:Staff ; schema:name ?name ;
    schema:position ?position ; schema:memberOf ?office .
  FILTER(lang(?name) = "ja")
  ?office rdf:type imas:Production ; schema:name ?officeName .
  FILTER(lang(?officeName) = "ja")
  OPTIONAL { ?staff imas:nameKana ?kana }
}"""
_UNITS_QUERY = _PREFIXES + """SELECT ?unit ?name ?kana ?member WHERE {
  ?idol imas:Brand "ShinyColors"@en ; rdf:type imas:Idol ; schema:memberOf ?unit ;
    schema:name ?member .
  FILTER(lang(?member) = "ja")
  ?unit rdf:type imas:Unit ; schema:name ?name .
  OPTIONAL { ?unit imas:nameKana ?kana }
}"""

_UNIT_LINK = re.compile(r'<a href="\./([\w-]+)"[^>]*class="idol-link"')
_MEMBER = re.compile(r'class="idol-group__name--text">([^<]*)<')
_LOGO = re.compile(r'class="idol-group__logo">\s*<picture>\s*<img[^>]*alt="([^"]*)"')
_LOGO_NAME = re.compile(r'class="idol-group__logo--name">([^<]*)<')


def open_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(60, connect=10),
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=True,
    )


@dataclass
class Changes:
    """What one kind of entry has gained and lost since the last import."""

    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)
    """Entries under the same name whose content changed (only units, by their members)."""


@dataclass
class WorldSyncReport:
    world: World
    path: Path
    previous: World | None
    """The file as it was before the import; None if there was none."""
    special_units: list[str] = field(default_factory=list)
    """im@sparql's units that are not on the official site, so were left out."""
    disagreements: list[str] = field(default_factory=list)
    """Where im@sparql and the official unit pages disagree."""
    notes: list[str] = field(default_factory=list)
    """Anything else the deployer should know about."""
    releases: ReleaseImport | None = None
    """What importing the releases and songs turned up."""
    lives: LiveImport | None = None
    """What importing the lives turned up."""
    setlists: SetlistImport | None = None
    """What importing the setlists turned up."""

    def lines(self) -> list[str]:
        world, previous = self.world, self.previous
        lines = [f"资料截止日：{world.as_of.isoformat()}"]
        lines.append(
            f"社长和事务员：{len(world.staff)} 位"
            + _changes(previous and _diff([s.name for s in previous.staff], [s.name for s in world.staff]))
        )
        lines.append(
            f"偶像：{len(world.idols)} 位"
            + _changes(previous and _diff([i.name for i in previous.idols], [i.name for i in world.idols]))
        )
        unit_changes = None
        if previous is not None:
            unit_changes = _diff([u.name for u in previous.units], [u.name for u in world.units])
            before = {u.name: u.members for u in previous.units}
            unit_changes.changed = [
                u.name for u in world.units if u.name in before and before[u.name] != u.members
            ]
        lines.append(f"组合：{len(world.units)} 个" + _changes(unit_changes))
        if self.disagreements:
            lines.append("im@sparql 和官方组合页对不上的地方（已按官方组合页写入，请人工核对）：")
            lines += [f"  {d}" for d in self.disagreements]
        else:
            lines.append("im@sparql 和官方组合页没有对不上的地方")
        if self.special_units:
            lines.append(f"im@sparql 里的特别组合，不算组合，没有收录：{'、'.join(self.special_units)}")
        lines += self._release_lines()
        lines += self._live_lines()
        lines += self._setlist_lines()
        lines += [f"注意：{note}" for note in self.notes]
        lines.append(f"已写入 {self.path}，请看过 git diff 再提交")
        return lines

    def _release_lines(self) -> list[str]:
        world, found = self.world, self.releases
        first = self.previous is None
        had = self.previous if self.previous and (self.previous.releases or self.previous.songs) else None
        lines = [
            f"唱片：{len(world.releases)} 张" + _changes(
                _diff([r.catalog for r in had.releases], [r.catalog for r in world.releases])
                if had else None, first=first
            ),
            f"歌曲：{len(world.songs)} 首" + _changes(
                _diff([s.id for s in had.songs], [s.id for s in world.songs]) if had else None,
                first=first,
            ),
        ]
        if found is None:
            return lines
        sections = [
            (found.filled, f"Lantis 没写演唱者、由{FUJI_NAME}补齐的曲目（请人工核对）："),
            (found.conflicts, f"Lantis 和{FUJI_NAME}冲突的地方（已按 Lantis 写入，请人工核对）："),
            (found.unmatched, "演唱者对应不到偶像名单的曲目（没有写入歌曲，请人工处理）："),
            (found.unknown, "哪个来源都没写演唱者的曲目（没有写入歌曲，请人工处理）："),
            (found.corrected, f"按 {CORRECTIONS_FILE} 人工更正的曲目："),
            (found.unused_corrections, f"{CORRECTIONS_FILE} 里对不上任何曲目的更正（没有套用，请检查品番、序号和曲名）："),
        ]
        for items, heading in sections:
            if items:
                lines.append(f"{heading}{len(items)} 首")
                lines += [f"  {item}" for item in items]
        lines += [f"注意：{note}" for note in found.notes]
        return lines


    def _live_lines(self) -> list[str]:
        world, found = self.world, self.lives
        had = self.previous if self.previous and self.previous.lives else None
        lines = [
            f"演出：{len(world.lives)} 场" + _changes(
                _diff([live.name for live in had.lives], [live.name for live in world.lives])
                if had else None, first=self.previous is None,
            ),
        ]
        if found is None:
            return lines
        sections = [
            (found.unlinked_absences, "wiki 上划掉了、但没写明缺席或没附官方新闻链接的出演者（没有采用，仍算出演，请人工核对）："),
            (found.conflicts, "wiki 和官方列表对不上的演出日（请人工核对）："),
            (found.unmatched, "对应不到偶像名单的出演者（没有写入，请人工核对）："),
            (found.no_performers, "wiki 上没有写出演者的演出日（这一天没有出演偶像，请人工核对）："),
            (found.official_only, "官方列表里有、wiki 上那几天没有演出的条目（多半不是演出，没有收录，请人工核对）："),
            (found.wiki_only, "wiki 上有、官方列表里没有的演出（嘉宾出演或官方还没收录，没有收录，请人工核对）："),
            (found.called_off, "wiki 上写着中止或没有出演的演出（没有收录）："),
            (found.corrected, f"按 {CORRECTIONS_FILE} 人工更正的演出日："),
            (found.unused_corrections, f"{CORRECTIONS_FILE} 里对不上任何演出日的更正（没有套用，请检查演出名和日期）："),
        ]
        for items, heading in sections:
            if items:
                lines.append(f"{heading}{len(items)} 项")
                lines += [f"  {item}" for item in items]
        return lines


    def _setlist_lines(self) -> list[str]:
        found = self.setlists
        had = self.previous if self.previous and self.previous.lives else None
        lines = [
            f"有曲目单的演出日：{len(_setlist_days(self.world))} 个" + _changes(
                _diff(_setlist_days(had), _setlist_days(self.world)) if had else None,
                first=self.previous is None,
            ),
        ]
        if found is None:
            return lines
        sections = [
            (found.unmatched, "曲目单里对应不到偶像名单的演唱者（没有写入，请人工核对）："),
            (found.not_on_stage, "曲目单里写着、但那天不在出演偶像里的演唱者（没有写入，请人工核对）："),
            (found.unknown_notes, "曲目单里看不懂的注记（没有采用，请人工核对）："),
            (found.mismatched, "imas-db 和演出资料对不上的演出日（没有写入曲目单，请人工核对）："),
            (found.missing, "imas-db 上没有曲目单的演出日（已经举办过的）："),
        ]
        for items, heading in sections:
            if items:
                lines.append(f"{heading}{len(items)} 项")
                lines += [f"  {item}" for item in items]
        return lines


def _setlist_days(world: World) -> list[str]:
    return [
        f"{live.name} {day.date.isoformat()}" for live in world.lives for day in live.days if day.setlist
    ]


def _diff(before: Sequence[str], after: Sequence[str]) -> Changes:
    return Changes(
        added=[name for name in after if name not in before],
        removed=[name for name in before if name not in after],
    )


def _changes(changes: Changes | None, first: bool = True) -> str:
    if changes is None:
        return "（第一次导入）" if first else "（旧资料文件里没有这一项）"
    parts = []
    if changes.added:
        parts.append(f"新增 {'、'.join(changes.added)}")
    if changes.removed:
        parts.append(f"移除 {'、'.join(changes.removed)}")
    if changes.changed:
        parts.append(f"成员有变化 {'、'.join(changes.changed)}")
    return f"（{'；'.join(parts)}）" if parts else "（没有变化）"


async def sync_world(path: Path, client: httpx.AsyncClient, today: date) -> WorldSyncReport:
    """Import the world setting as of `today` and replace the file at `path` with it.
    Raises WorldSyncError, having written nothing, if any source fails."""
    try:
        previous = load_world(path)
        unreadable = None
    except WorldError as e:
        previous, unreadable = None, str(e)

    idol_rows = await _sparql(client, _IDOLS_QUERY)
    staff_rows = await _sparql(client, _STAFF_QUERY)
    unit_rows = await _sparql(client, _UNITS_QUERY)
    official = await _official_units(client)

    disagreements: list[str] = []
    notes = [f"旧资料文件读不了，增减无从比较：{unreadable}"] if unreadable else []
    office, staff = _staff(staff_rows)
    units, special = _units(official, unit_rows, disagreements)
    idols = _idols(idol_rows, units, disagreements, notes)

    async def fetch(url: str) -> str:
        return (await _get(client, url)).text

    track_corrections, live_corrections = _corrections(path.parent / CORRECTIONS_FILE, idols)
    roster = Roster(idols, units, staff)
    found = await import_releases(fetch, roster, track_corrections)
    lives = await import_lives(fetch, roster, live_corrections)
    setlists = await import_setlists(fetch, lives.lives, roster, today)
    world = World(
        today, office, staff, tuple(units), idols, found.releases, found.songs, setlists.lives
    )
    report = WorldSyncReport(
        world, path, previous, special, disagreements, notes, found, lives, setlists
    )
    _write(path, report.world)
    return report


def _corrections(path: Path, idols: Sequence[Idol]) -> tuple[TrackCorrections, LiveCorrections]:
    """The deployer's corrections beside the data file; none if there is no file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return TrackCorrections(), LiveCorrections()
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise WorldSyncError(f"人工更正文件 {path} 格式有误：{e}") from None
    return (
        TrackCorrections.from_json(data, idols, str(path)),
        LiveCorrections.from_json(data, idols, str(path)),
    )


async def _get(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    try:
        response = await client.get(url, **kwargs)
    except httpx.HTTPError as e:
        raise WorldSyncError(f"无法访问 {url}：{e!r}") from None
    if response.status_code != 200:
        raise WorldSyncError(f"{response.url} 返回了 HTTP {response.status_code}")
    return response


async def _sparql(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    """The query's result rows, each variable bound to its value."""
    response = await _get(
        client, SPARQL_URL, params={"query": query},
        headers={"Accept": "application/sparql-results+json"},
    )
    try:
        bindings = response.json()["results"]["bindings"]
        return [{name: value["value"] for name, value in row.items()} for row in bindings]
    except (ValueError, KeyError, TypeError) as e:
        raise WorldSyncError(f"{SPARQL_URL} 的回答不是预期的格式：{e!r}") from None


@dataclass(frozen=True)
class _OfficialUnit:
    url: str
    name: str
    members: tuple[str, ...]


async def _official_units(client: httpx.AsyncClient) -> list[_OfficialUnit]:
    index = (await _get(client, OFFICIAL_URL)).text
    slugs = list(dict.fromkeys(_UNIT_LINK.findall(index)))
    if not slugs:
        raise WorldSyncError(f"{OFFICIAL_URL} 上找不到任何组合，页面结构可能变了")
    units = []
    for slug in slugs:
        url = f"{OFFICIAL_URL}{slug}/"
        page = (await _get(client, url)).text
        logo, name_under = _LOGO.search(page), _LOGO_NAME.search(page)
        name = _text(logo.group(1)) if logo else ""
        name = name or (_text(name_under.group(1)) if name_under else "")
        members = tuple(_person(member) for member in _MEMBER.findall(page))
        if not name or not members:
            raise WorldSyncError(f"{url} 上找不到组合名或成员，页面结构可能变了")
        units.append(_OfficialUnit(url, name, members))
    return units


def _text(raw: str) -> str:
    return html.unescape(raw).replace("’", "'").strip()


def _person(raw: str) -> str:
    """A name as the data file keeps it, without the space between family and given name."""
    return without_spaces(html.unescape(raw))


def _people(names: Iterable[str]) -> set[str]:
    """Names as the roster compares them, the official pages' and im@sparql's alike."""
    return {person_key(name) for name in names}


def _staff(rows: list[dict[str, str]]) -> tuple[str, tuple[Staff, ...]]:
    if not rows:
        raise WorldSyncError(f"{SPARQL_URL} 没有返回社長和事務員")
    staff: dict[str, Staff] = {}
    for row in rows:
        if row["staff"] not in staff:
            staff[row["staff"]] = Staff(
                row["name"], row.get("kana", ""), row["position"], (row["staff"],)
            )
    return rows[0]["officeName"], tuple(staff.values())


def _units(
    official: list[_OfficialUnit], rows: list[dict[str, str]], disagreements: list[str]
) -> tuple[list[Unit], list[str]]:
    """The official units, with their readings from im@sparql, and im@sparql's other
    units, which are special ones."""
    sparql: dict[str, dict] = {}
    for row in rows:
        unit = sparql.setdefault(
            unit_key(row["name"]),
            {"uri": row["unit"], "name": row["name"], "kana": row.get("kana"), "members": []},
        )
        unit["members"].append(row["member"])
    if not sparql:
        raise WorldSyncError(f"{SPARQL_URL} 没有返回任何组合")
    units = []
    for unit in official:
        match = sparql.pop(unit_key(unit.name), None)
        if match is None:  # named differently there: the same members make it the same unit
            same = [k for k, u in sparql.items() if _people(u["members"]) == _people(unit.members)]
            if same:
                match = sparql.pop(same[0])
                disagreements.append(f"{unit.name}：im@sparql 里叫 {match['name']}，按成员对上了")
        if match is None:
            disagreements.append(f"{unit.name}：im@sparql 里没有这个组合，读音空缺")
            units.append(Unit(unit.name, None, unit.members, (unit.url,)))
            continue
        for member in unit.members:
            if person_key(member) not in _people(match["members"]):
                disagreements.append(f"{unit.name}：官方组合页有 {member}，im@sparql 的组合里没有")
        for member in match["members"]:
            if person_key(member) not in _people(unit.members):
                disagreements.append(f"{unit.name}：im@sparql 的组合里有 {member}，官方组合页没有")
        units.append(Unit(unit.name, match["kana"], unit.members, (unit.url, match["uri"])))
    return units, sorted(unit["name"] for unit in sparql.values())


def _idols(
    rows: list[dict[str, str]], units: Iterable[Unit], disagreements: list[str], notes: list[str]
) -> tuple[Idol, ...]:
    """im@sparql's idols in the order of the official units and their members, each in
    the unit the official pages put her in."""
    if not rows:
        raise WorldSyncError(f"{SPARQL_URL} 没有返回任何偶像")
    found: dict[str, dict] = {}
    for row in rows:
        idol = found.setdefault(
            row["name"], {"uri": row["idol"], "kana": row.get("kana", ""), "cvs": []}
        )
        if (cv := row.get("cv")) and cv not in idol["cvs"]:
            idol["cvs"].append(cv)
    unit_of: dict[str, Unit] = {}
    order: list[str] = []
    for unit in units:
        for member in unit.members:
            if member not in found:
                disagreements.append(
                    f"{member}：官方组合页上 {unit.name} 的成员，im@sparql 的偶像名单里没有，没有收录"
                )
            elif member in unit_of:
                disagreements.append(
                    f"{member}：官方组合页上同时在 {unit_of[member].name} 和 {unit.name}，按前者收录"
                )
            else:
                unit_of[member] = unit
                order.append(member)
    for name in found:
        if name not in unit_of:
            disagreements.append(f"{name}：不在官方组合页的任何组合里，所属组合空缺")
            order.append(name)
    idols = []
    for name in order:
        idol, unit = found[name], unit_of.get(name)
        if len(idol["cvs"]) > 1:
            notes.append(f"{name} 在 im@sparql 里有多个声优，取了第一个：{'、'.join(idol['cvs'])}")
        sources = (idol["uri"], unit.sources[0]) if unit else (idol["uri"],)
        idols.append(
            Idol(name, idol["kana"], unit.name if unit else None,
                 idol["cvs"][0] if idol["cvs"] else None, sources)
        )
    return tuple(idols)


def _write(path: Path, world: World) -> None:
    """Replace the file whole, so that it is never left half written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    try:
        partial.write_text(
            json.dumps(world.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        os.replace(partial, path)
    finally:
        partial.unlink(missing_ok=True)
