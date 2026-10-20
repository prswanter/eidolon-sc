"""Importing the world setting (`eidolon world sync`): idols, units, the office's president
and clerk from im@sparql and the official unit pages, releases and songs from Lantis with
ふじわらはじめ filling in what Lantis leaves out, driven through the command against fake
sites and checked in the data file it writes and the report it prints."""

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from tests.conftest import Admin, CharacterConfig
from tests.fakes import (
    DANCE_ONLY,
    CmsLive,
    FakeWorldSites,
    FujiDisc,
    ImasDbLive,
    ImasDbPage,
    ImasDbShow,
    LantisRelease,
    OldSiteEvent,
    WikiLive,
    imas_badge,
    imas_brand,
    imas_idol,
    imas_note,
    imas_unit,
    struck,
)

SPARQL_DETAIL = "https://sparql.crssnky.xyz/imasrdf/RDFs/detail/"
OFFICIAL = "https://shinycolors.idolmaster-official.jp/idol/"
LANTIS = "https://shinycolors.lantis.jp/releaseinfo/"
PORTAL = "https://idolmaster-official.jp/"
WIKI = "https://wikiwiki.jp/shinycolors/%E3%83%A9%E3%82%A4%E3%83%96%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88%E6%83%85%E5%A0%B1"
WIKI_LOG01 = WIKI + "/%E9%96%8B%E5%82%AC%E6%83%85%E5%A0%B1log01"
NEWS = "https://idolmaster-official.jp/news/01_3863"

ILLUMINATION = "櫻木真乃（CV.関根 瞳）、風野灯織（CV.近藤玲奈）、八宮めぐる（CV.峯田茉優）"
SOP = "THE IDOLM@STER SHINY COLORS Song for Prism Shower of light / 快盗Vを見逃すな"
HOPEFUL = "THE IDOLM@STER SHINY COLORS HOPEFUL FE@THERS -Stella-"


def lantis_releases() -> list[LantisRelease]:
    """Four CDs in the shapes Lantis's pages come in: a unit's, whose tracks name no
    singers; a special unit's, each track with a 歌： line; one whose track lines read
    「曲名 / 角色 (CV.声优)」 but name a special unit without saying who is in it; and a
    Song for Prism single of two units, which does not say which unit sings which."""
    return [
        LantisRelease(
            "lacm-14782", "THE IDOLM@STER SHINY COLORS BRILLI@NT WING 02 ヒカリのdestination",
            "2018/7/4", "LACM-14782", "イルミネーションスターズ",
            [
                "1．ヒカリのdestination\n作詞：中村彼方　作曲・編曲：中野領太",
                "2．虹になれ\n作詞：中村彼方　作曲：中野領太",
                "3．Spread the Wings!!（イルミネーションスターズ Ver.）",
                "4．スペシャルオーディオドラマ「輝く笑顔に向かって」",
            ],
            artist_members=ILLUMINATION,
        ),
        LantisRelease(
            "laca-15861", "THE IDOLM@STER SHINY COLORS COLORFUL FE@THERS -Stella-",
            "2021/1/20", "LACA-15861", "Team.Stella",
            [
                "1．プラニスフィア ～planisphere～\n歌：Team.Stella\n作詞：松井洋平",
                "2．ありったけの輝きで\n歌：櫻木真乃（CV.関根 瞳）",
                "3．アポイント・シグナル\n歌：月岡恋鐘（CV.礒部花凜）",
                "4．ありったけの輝きで（Off Vocal）",
            ],
            artist_members="櫻木真乃（CV.関根 瞳）、月岡恋鐘（CV.礒部花凜）、小宮果穂（CV.河野ひより）",
        ),
        LantisRelease(
            "laca-25301", HOPEFUL, "2026/9/16", "LACA-25301", "Team.Stella",
            [
                "1. MAGICAL FOREST / 櫻木真乃 (CV.関根 瞳)\n作詞：渡邊亜希子　作曲：石黑剛、常楽寺澪",
                "2. 恋するクオリア / 月岡恋鐘 (CV.礒部花凜)",
                "3. プラニスフィア ～planisphere～ -9 colors- / Team.Stella",
            ],
        ),
        LantisRelease(
            "lacm-24634", f"{SOP} 【イルミネーションスターズ盤】", "2025/1/22", "LACM-24634",
            "イルミネーションスターズ / 放課後クライマックスガールズ",
            [
                "1．Shower of light", "2．快盗Vを見逃すな",
                "3．Shower of light (Game Size)", "4．Shower of light (Off Vocal)",
            ],
        ),
    ]


def fuji_discs() -> list[FujiDisc]:
    """ふじわらはじめ's discs, as it keeps them: it names each song as it was first
    released, whatever version a disc has, and a special unit's song sometimes by its
    idols alone, without the special unit's name."""
    return [
        FujiDisc(4654, SOP, [
            ("Shower of light", [("イルミネーションスターズ", ["櫻木真乃", "風野灯織", "八宮めぐる"])], [], ["orig"]),
            ("快盗Vを見逃すな", [("放課後クライマックスガールズ", ["小宮果穂"])], [], ["orig"]),
            ("Shower of light", [("イルミネーションスターズ", ["櫻木真乃", "風野灯織", "八宮めぐる"])], [], ["gamever"]),
            ("Shower of light", [], [], ["offvocal"]),
        ]),
        FujiDisc(5000, HOPEFUL, [
            ("MAGICAL FOREST", [], ["櫻木真乃"], ["orig"]),
            ("プラニスフィア ～planisphere～", [], ["櫻木真乃", "月岡恋鐘", "小宮果穂", "八宮めぐる"], []),
        ]),
    ]

FOURTH = "THE IDOLM@STER SHINY COLORS 4thLIVE 空は澄み、今を越えて。"
MOIW = "THE IDOLM@STER M@STERS OF IDOL WORLD!!!!! 2023"
SHOWDOWN = "THE IDOLM@STER SideM × SHINY COLORS SPARKLE SHOWDOWN"
TOUR = "THE IDOLM@STER SHINY COLORS 3rd LIVE TOUR PIECE ON PLANET"
UKA = "283 Production LIVE Performance Uka,"
FIRST = "THE IDOLM@STER SHINY COLORS 1stLIVE FLY TO THE SHINY SKY"

ILLUMINATION_ON_STAGE = "関根 瞳（櫻木 真乃役）/近藤 玲奈（風野 灯織役）/峯田 茉優（八宮 めぐる役）"


def cms_lives() -> list[CmsLive]:
    """The CMS's LIVE-EVENT articles: Shiny Colors' own lives (one a tour of two cities,
    one an xR live, a detail page), a joint live, one still to come, another brand's
    live, and something of Shiny Colors' that is no live."""
    return [
        CmsLive("23494", SHOWDOWN, ["SIDEM", "SHINYCOLORS"], "2027年6月5日(土)、6日(日)", "横浜アリーナ",
                "https://idolmaster-official.jp/live_event/sidem_shinycolors_ss/"),
        CmsLive("3444", FOURTH + " ", ["SHINYCOLORS"],
                "2022年4月23日(土)\n2022年4月24日(日)", "幕張メッセ国際展示場1~3ホール",
                "https://idolmaster-official.jp/live_event/shinycolors_4th/"),
        CmsLive("9001", "THE IDOLM@STER SideM 8thLIVE", ["SIDEM"],
                "2022年4月23日(土)", "どこかのアリーナ", "https://idolmaster-official.jp/live_event/sidem_8th/"),
        CmsLive("8056", MOIW, ["IDOLMASTER", "CINDERELLAGIRLS", "MILLIONLIVE", "SIDEM", "SHINYCOLORS"],
                "2023年 2月11日（土）15:00開場／17:00開演\n2023年 2月12日（日）15:00開場／17:00開演",
                "東京ドーム", "https://idolmaster-official.jp//live_event/idolworld2023/"),
        CmsLive("1882", TOUR, ["SHINYCOLORS"],
                "名古屋：2021年4月3日(土)、4日(日)\n東京　：2021年4月24日(土)",
                "名古屋：日本ガイシホール\n東京　：東京ガーデンシアター",
                "https://idolmaster-official.jp/live_event/shinycolors_3rd/"),
        CmsLive("17848", UKA, ["SHINYCOLORS"], "2025年5月10日(土)", "オリックス劇場",
                url_name="283_Uka", article_type="detail_page"),
        CmsLive("16491", "283PRODUCTION COSTUME G@LLERY", ["SHINYCOLORS"],
                "2025年3月22日(土) ～ 3月31日(月)", "ルクア 9F",
                "https://idolmaster-official.jp/live_event/283_costumegallery/"),
        CmsLive("99", "283PRODUCTION LP", ["SHINYCOLORS"], "", "", article_type="lp_detail"),
    ]


def wiki_lives() -> list[WikiLive]:
    """The wiki's lives, Shiny Colors' performers only, as it writes them: by day, or
    for every day alike on an old page; struck out with a footnote when absent; the
    idols alone for an xR live."""
    log = "ライブイベント情報/開催情報log01"
    return [
        WikiLive(SHOWDOWN, ["2027年6月5日(土) 16:00開場", "2027年6月6日(日) 16:00開場"], [
            ("2027年6月5日(土)", ["放課後クライマックスガールズ", "河野 ひより（小宮 果穂役）"]),
            ("2027年6月6日(日)", ["イルミネーションスターズ", ILLUMINATION_ON_STAGE]),
        ]),
        WikiLive("Animelo Summer Live 2026 -Messenger-", ["2026年7月11日(土)"], [
            ("2026年7月11日(土)", ["礒部 花凜（月岡 恋鐘役）"]),
        ]),
        WikiLive("283 Production LIVE Performance Uka", ["2025年5月10日(土)"], [
            ("2025年5月10日(土)", ["櫻木 真乃 / 風野 灯織"]),
        ]),
        WikiLive("4thLIVE 空は澄み、今を越えて。", ["2022年4月23日(土)", "2022年4月24日(日)"], [
            ("2022年4月23日(土)", [
                "イルミネーションスターズ", ILLUMINATION_ON_STAGE,
                "アンティーカ", "礒部 花凜（月岡 恋鐘役）/菅沼 千紗（田中 摩美々役）",
                "進行MC", "山村 響（七草 はづき役） / 田口 尚平",
            ]),
            ("2022年4月24日(日)", [
                "2022/04/20 出演者変更",
                "イルミネーションスターズ",
                struck("関根 瞳（櫻木 真乃役）", "2022/04/20出演見合わせ", NEWS)
                + "/近藤 玲奈（風野 灯織役）/峯田 茉優（八宮 めぐる役）",
                "アンティーカ",
                struck("礒部 花凜（月岡 恋鐘役）", "2022/04/21出演見合わせ") + "/菅沼 千紗（田中 摩美々役）",
            ]),
        ], page=log),
        WikiLive("M@STERS OF IDOL WORLD!!!!! 2023", ["2023年2月11日(土)", "2023年2月12日(日)"], [
            ("2023年2月11日(土)", [
                "関根 瞳（櫻木 真乃役）/河野 ひより（小宮 果穂役）/中村 繪里子（天海 春香役）",
            ]),
            ("2023年2月12日(日)", ["礒部 花凜（月岡 恋鐘役）"]),
        ], page=log),
        WikiLive("3rdLIVE TOUR PIECE ON PLANET", ["2021年4月3日(土)", "2021年4月4日(日)", "2021年4月24日(土)"], [
            ("2021年4月3日(土)", [ILLUMINATION_ON_STAGE]),
            ("2021年4月4日(日)", ["関根 瞳（櫻木 真乃役）"]),
            ("2021年4月24日(土)", ["礒部 花凜（月岡 恋鐘役）"]),
        ], page=log),
        WikiLive("(開催中止) SPRING PARTY 2020", ["2020年3月14日(土)"], [
            (None, [ILLUMINATION_ON_STAGE]),
        ], page=log),
        WikiLive("1stLIVE FLY TO THE SHINY SKY", ["2019年3月9日（土）", "2019年3月10日（日）"], [
            (None, ["イルミネーションスターズ", ILLUMINATION_ON_STAGE]),
        ], page=log, name=FIRST),
    ]


def old_events() -> dict[int, list[OldSiteEvent]]:
    """The old official site's events before the CMS began: Shiny Colors' first live,
    one called off, and another brand's on the day of the first live."""
    return {
        2019: [
            OldSiteEvent("THE IDOLM@STER SHINY COLORS 1stLIVE", "2019年3月9日(土) 開場17:00<br>"
                         "<table><tr><td>2019年3月10日(日)</td><td>昼公演</td></tr></table>",
                         "舞浜アンフィシアター", "https://idolmaster.jp/event/shinycolors_1st.php"),
            OldSiteEvent("THE IDOLM@STER CINDERELLA GIRLS 某公演", "2019年3月9日(土)", "メットライフドーム"),
        ],
        2020: [
            OldSiteEvent("THE IDOLM@STER SHINY COLORS SPRING PARTY 2020", "2020年3月14日(土)", "どこか"),
        ],
    }


IMASDB = "https://imas-db.jp/song/event/"
SHANI = imas_badge("シャニ", "シャイニーカラーズ", "shinycolors")


def imasdb_lives() -> list[ImasDbLive]:
    """imas-db's setlists: 4thLIVE a page a day, the second with a performer who stood
    only on the songs naming her; MOIW, a joint live with covers, its first day only;
    1stLIVE, one setlist for every show; the tour's first two days on one page and a day
    the lives do not have; and Uka, with two shows on its one day."""
    illumination = imas_unit("イルミネーションスターズ", old=True)
    fourth_day1 = ImasDbPage(
        "shinycolors_4th_day1.html", f"{FOURTH} [DAY1]",
        "2022/04/23(土) 幕張メッセ国際展示場1~3ホール, 開場15:00/開演17:00",
        [ImasDbShow("セットリスト", [
            ("1", "Dye the sky.", "全員"),
            ("2", "ヒカリのdestination", illumination),
            ("", "(MC)", illumination),
            ("3", "革命進化論", imas_unit("アンティーカ", old=True)),
            ("4", "アポイント・シグナル", imas_idol("月岡恋鐘", "礒部花凜", old=True)
             + " " + imas_note("(バックダンス: " + imas_idol("田中摩美々", "菅沼千紗", old=True) + ")")),
            ("5", '乱舞る <small class="notes d-inline-block">(short ver.)</small>',
             imas_unit("イルミネーションスターズ") + " " + DANCE_ONLY),
        ])],
    )
    fourth_day2 = ImasDbPage(
        "shinycolors_4th_day2.html", f"{FOURTH} [DAY2]",
        "2022/04/24(日) 幕張メッセ国際展示場1~3ホール, 開場15:00/開演17:00",
        [ImasDbShow("セットリスト", [
            ("1", "Multicolored Sky", "全員"),
            ("2", "Daybreak Age", "全員 " + imas_note("(※" + imas_idol("八宮めぐる", "峯田茉優") + "を含む)")),
            ("3", "虹になれ", imas_unit("イルミネーションスターズ")),
            ("4", "ありったけの輝きで", imas_idol("櫻木真乃", "関根瞳")),
            ("5", "SOLAR WAY", "Team.Sol"),
            ("6", "こいぬのうた", imas_idol("西城樹里", "永井真里子")),
            ("7", "リフレクトサイン", imas_unit("Team.Luna") + ", " + imas_idol("風野灯織", "近藤玲奈")),
        ])],
        cast=imas_unit("イルミネーションスターズ") + " (" + imas_idol("風野灯織", "近藤玲奈") + ", "
        + imas_idol("八宮めぐる", "峯田茉優") + imas_note("※") + ")",
    )
    others = imas_unit("U149 第3芸能課", brand="4") + " (" + imas_idol("佐々木千枝", "今井麻夏", brand="4") + ")"
    moiw_day1 = ImasDbPage(
        "idolmaster_idolworld2023_day1.html", f"{MOIW} [DAY1]", "2023/02/11(土) 東京ドーム, 開場15:00/開演17:00",
        [ImasDbShow("セットリスト", [
            ("1", "THE IDOLM@STER " + imas_badge("765AS", "765PRO ALLSTARS", "765as"),
             imas_unit("765PRO ALLSTARS", brand="1")),
            ("2", "ドレミファクトリー！ " + imas_badge("シンデレラ", "シンデレラガールズ", "cinderella"),
             others + "\n+ " + imas_idol("小宮果穂", "河野ひより")),
            ("3", "Resonance⁺ " + SHANI, imas_brand("シャイニーカラーズ", "8")),
            ("4", "ビーチブレイバー " + SHANI, imas_unit("放課後クライマックスガールズ")),
            ("5", "アイ MUST GO! " + imas_badge("IM@S", "THE IDOLM@STERシリーズ", "idolmaster"),
             "全員 " + imas_note("(※" + imas_idol("小宮果穂", "河野ひより") + "を除く)")),
        ])],
    )
    first = ImasDbPage(
        "shinycolors1st0309.html", FIRST, "2019/03/09(土)・10(日) 舞浜アンフィシアター, 1日目: 開場17:00/開演18:00",
        [ImasDbShow("公演内容(全公演共通)", [("1", "Spread the Wings!!", "全員"), ("", "(MC)", "全員")])],
    )
    nagoya = ImasDbPage(
        "shinycolors3rd_nagoya.html", f"{TOUR} / NAGOYA", "2021/04/03(土)・04(日) 日本ガイシホール",
        [
            ImasDbShow("DAY1 セットリスト", [("1", "PRISISM", illumination)]),
            ImasDbShow("DAY2 セットリスト", [("1", "スマイルシンフォニア", "全員")]),
        ],
    )
    tokyo = ImasDbPage(
        "shinycolors3rd0425.html", f"{TOUR} / TOKYO [DAY2]", "2021/04/25(日) 東京ガーデンシアター",
        [ImasDbShow("セットリスト", [("1", "Mr.Sunshine", "全員")])],
    )
    uka = ImasDbPage(
        "shinycolors_283_uka.html", UKA, None,
        [
            ImasDbShow("Larva,1 セットリスト", [("1", "Uka", "全員")]),
            ImasDbShow("Pupa,2 セットリスト", [("1", "Uka", "全員")]),
        ],
        schedule=[("Larva,1", "2025/05/10(土) 開場12:30/開演13:30"), ("Pupa,2", "2025/05/10(土) 開場16:30/開演17:30")],
    )
    return [
        ImasDbLive(UKA, "8", [(UKA, uka, "2025/05/10(土)")]),
        ImasDbLive(MOIW, "1,4,5,6,8,9", [("DAY1", moiw_day1, "2023/02/11(土)")]),
        ImasDbLive(FOURTH, "8", [("DAY1", fourth_day1, "2022/04/23(土)"), ("DAY2", fourth_day2, "2022/04/24(日)")]),
        ImasDbLive(TOUR, "8", [("名古屋公演", nagoya, "2021/04/03(土)・04(日)"), ("東京公演DAY2", tokyo, "2021/04/25(日)")]),
        ImasDbLive(FIRST, "8", [(FIRST, first, "2019/03/09(土)・10(日)")]),
    ]


IDOLS = [
    ("Sakuragi_Mano", "櫻木真乃", "さくらぎまの", "関根瞳"),
    ("Kazano_Hiori", "風野灯織", "かざのひおり", "近藤玲奈"),
    ("Hachimiya_Meguru", "八宮めぐる", "はちみやめぐる", "峯田茉優"),
    ("Tsukioka_Kogane", "月岡恋鐘", "つきおかこがね", "礒部花凜"),
    ("Tanaka_Mamimi", "田中摩美々", "たなかまみみ", "菅沼千紗"),
    ("Komiya_Kaho", "小宮果穂", "こみやかほ", "河野ひより"),
]


@pytest.fixture
def sites() -> FakeWorldSites:
    """Six idols in three units, one of which the official site names only in Japanese
    under its logo, and a special unit im@sparql lists beside them."""
    sites = FakeWorldSites()
    sites.idols = [dict(id=i, name=n, kana=k, cv=cv) for i, n, k, cv in IDOLS]
    sites.staff = [
        dict(id="Amai_Tsutomu", name="天井努", kana="あまいつとむ", position="社長"),
        dict(id="Nanakusa_Hazuki", name="七草はづき", kana="ななくさはづき", position="事務員"),
    ]
    sites.sparql_units = {
        "illuminationSTARS": ("いるみねーしょんすたーず", ["櫻木真乃", "風野灯織", "八宮めぐる"]),
        "L'Antica": ("あんてぃーか", ["月岡恋鐘", "田中摩美々"]),
        "放課後クライマックスガールズ": ("ほうかごくらいまっくすがーるず", ["小宮果穂"]),
        "Team.Stella": ("ちーむ すてら", ["櫻木真乃", "月岡恋鐘", "小宮果穂"]),
    }
    sites.official_units = [
        ("illuminationstars", "illumination STARS", "イルミネーションスターズ",
         ["櫻木 真乃", "風野 灯織", "八宮 めぐる"]),
        ("lantica", "L’Antica", "アンティーカ", ["月岡 恋鐘", "田中 摩美々"]),
        ("hokagoclimaxgirls", "", "放課後クライマックスガールズ", ["小宮 果穂"]),
    ]
    sites.releases = lantis_releases()
    sites.blu_rays = [("labx-8376_7", "「THE IDOLM@STER SHINY COLORS 1stLIVE FLY TO THE SHINY SKY」Blu-ray")]
    sites.fuji_discs = {disc.tax_id: disc for disc in fuji_discs()}
    sites.cms_lives = cms_lives()
    sites.wiki_lives = wiki_lives()
    sites.old_events = old_events()
    sites.imasdb_lives = imasdb_lives()
    sites.fuji_songs = {
        1491: ("ヒカリのdestination", []),
        3000: ("プラニスフィア ～planisphere～", [5000]),
        3001: ("MAGICAL FOREST", [5000]),
        5930: ("Shower of light", [4654]),
        5931: ("快盗Vを見逃すな", [4654]),
    }
    return sites


@pytest.fixture
def world_sync(
    admin: Admin, characters: CharacterConfig, sites: FakeWorldSites, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr("eidolon.world_sync.open_client", sites.client)

    def run() -> tuple[int, str, str]:
        return admin.invoke("world", "sync", "--characters", str(characters.path))

    return run


def world_file(characters: CharacterConfig) -> Path:
    return characters.directory / "world.json"


def read_world(characters: CharacterConfig) -> dict:
    return json.loads(world_file(characters).read_text(encoding="utf-8"))


def test_the_import_writes_the_office_idols_and_units_beside_the_character_configuration(
    world_sync, characters: CharacterConfig
):
    code, _, err = world_sync()

    assert code == 0, err
    world = read_world(characters)
    assert world["as_of"] == date.today().isoformat()
    assert world["office"] == {
        "name": "283プロダクション",
        "staff": [
            {"name": "天井努", "reading": "あまいつとむ", "position": "社長",
             "sources": [SPARQL_DETAIL + "Amai_Tsutomu"]},
            {"name": "七草はづき", "reading": "ななくさはづき", "position": "事務員",
             "sources": [SPARQL_DETAIL + "Nanakusa_Hazuki"]},
        ],
    }
    assert world["units"] == [
        {"name": "illumination STARS", "reading": "いるみねーしょんすたーず",
         "members": ["櫻木真乃", "風野灯織", "八宮めぐる"],
         "sources": [OFFICIAL + "illuminationstars/", SPARQL_DETAIL + "illuminationSTARS"]},
        {"name": "L'Antica", "reading": "あんてぃーか", "members": ["月岡恋鐘", "田中摩美々"],
         "sources": [OFFICIAL + "lantica/", SPARQL_DETAIL + "L'Antica"]},
        {"name": "放課後クライマックスガールズ", "reading": "ほうかごくらいまっくすがーるず",
         "members": ["小宮果穂"],
         "sources": [OFFICIAL + "hokagoclimaxgirls/", SPARQL_DETAIL + "放課後クライマックスガールズ"]},
    ]
    assert world["idols"][0] == {
        "name": "櫻木真乃", "reading": "さくらぎまの", "unit": "illumination STARS", "cv": "関根瞳",
        "sources": [SPARQL_DETAIL + "Sakuragi_Mano", OFFICIAL + "illuminationstars/"],
    }
    assert [(i["name"], i["unit"]) for i in world["idols"]] == [
        ("櫻木真乃", "illumination STARS"), ("風野灯織", "illumination STARS"),
        ("八宮めぐる", "illumination STARS"), ("月岡恋鐘", "L'Antica"), ("田中摩美々", "L'Antica"),
        ("小宮果穂", "放課後クライマックスガールズ"),
    ]


def test_the_report_counts_each_kind_and_what_changed_since_the_last_import(
    world_sync, sites: FakeWorldSites
):
    _, first, _ = world_sync()
    sites.idols.append(dict(id="Suzuki_Hana", name="鈴木羽那", kana="すずきはな", cv="三川華月"))
    sites.sparql_units["CoMETIK"] = ("こめてぃっく", ["鈴木羽那"])
    sites.official_units.append(("cometik", "CoMETIK", "コメティック", ["鈴木 羽那"]))
    sites.idols = [i for i in sites.idols if i["name"] != "田中摩美々"]
    sites.sparql_units["L'Antica"] = ("あんてぃーか", ["月岡恋鐘"])
    sites.official_units[1] = ("lantica", "L’Antica", "アンティーカ", ["月岡 恋鐘"])

    code, second, err = world_sync()

    assert code == 0, err
    assert "偶像：6 位" in first
    assert "组合：3 个" in first
    assert "社长和事务员：2 位" in first
    assert "偶像：6 位（新增 鈴木羽那；移除 田中摩美々）" in second
    assert "组合：4 个（新增 CoMETIK；成员有变化 L'Antica）" in second
    assert "社长和事务员：2 位（没有变化）" in second


def test_where_im_sparql_and_the_official_unit_pages_disagree_is_reported(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.official_units[0] = (
        "illuminationstars", "illumination STARS", "イルミネーションスターズ",
        ["櫻木 真乃", "風野 灯織"],
    )

    code, out, _ = world_sync()

    assert code == 0
    assert "对不上" in out
    assert "illumination STARS" in out and "八宮めぐる" in out
    world = read_world(characters)
    assert world["units"][0]["members"] == ["櫻木真乃", "風野灯織"]  # the official page decides
    meguru = next(i for i in world["idols"] if i["name"] == "八宮めぐる")
    assert meguru["unit"] is None


@pytest.mark.parametrize(
    "host", [
        FakeWorldSites.SPARQL, FakeWorldSites.OFFICIAL, FakeWorldSites.LANTIS, FakeWorldSites.FUJI,
        FakeWorldSites.CMS, FakeWorldSites.OLD, FakeWorldSites.WIKI, FakeWorldSites.IMASDB,
    ]
)
def test_when_a_source_fails_the_import_fails_and_the_old_file_is_kept(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig, host: str
):
    world_sync()
    before = world_file(characters).read_text(encoding="utf-8")
    sites.idols.append(dict(id="Suzuki_Hana", name="鈴木羽那", kana="すずきはな", cv="三川華月"))
    sites.down.add(host)

    code, _, err = world_sync()

    assert code != 0
    assert host in err
    assert world_file(characters).read_text(encoding="utf-8") == before
    assert list(characters.directory.glob("world.json*")) == [world_file(characters)]


@pytest.mark.parametrize("page", ["idol/gone", "releaseinfo/laca-15861"])
def test_a_page_missing_from_the_official_site_or_lantis_fails_the_import(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig, page: str
):
    if page == "idol/gone":  # a unit the official index links to
        sites.official_units.append(("gone", "Gone", "ゴーン", ["櫻木 真乃"]))
    sites.missing.add(page)

    code, _, err = world_sync()

    assert code != 0
    assert page in err
    assert not world_file(characters).exists()


def test_members_written_with_a_space_on_im_sparql_are_no_disagreement(
    world_sync, sites: FakeWorldSites
):
    sites.sparql_units["illuminationSTARS"] = (
        "いるみねーしょんすたーず", ["櫻木 真乃", "風野　灯織", "八宮めぐる"],
    )

    code, out, err = world_sync()

    assert code == 0, err
    assert "im@sparql 和官方组合页没有对不上的地方" in out


def test_a_unit_im_sparql_names_differently_is_matched_by_its_members(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.sparql_units["ホウカゴ"] = sites.sparql_units.pop("放課後クライマックスガールズ")

    code, out, _ = world_sync()

    assert code == 0
    assert read_world(characters)["units"][2]["reading"] == "ほうかごくらいまっくすがーるず"
    assert "im@sparql 里叫 ホウカゴ" in out
    assert "没有收录：Team.Stella\n" in out  # not taken for a special unit


def songs_by_title(characters: CharacterConfig) -> dict[str, dict]:
    return {song["title"]: song for song in read_world(characters)["songs"]}


def release(characters: CharacterConfig, catalog: str) -> dict:
    return next(r for r in read_world(characters)["releases"] if r["catalog"] == catalog)


def test_releases_come_from_lantis_s_cds_with_their_tracks_in_order(
    world_sync, characters: CharacterConfig
):
    code, _, err = world_sync()

    assert code == 0, err
    world = read_world(characters)
    assert [r["catalog"] for r in world["releases"]] == [
        "LACM-14782", "LACA-15861", "LACM-24634", "LACA-25301",  # by release date
    ]
    assert release(characters, "LACM-14782") == {
        "catalog": "LACM-14782",
        "title": "THE IDOLM@STER SHINY COLORS BRILLI@NT WING 02 ヒカリのdestination",
        "date": "2018-07-04",
        "tracks": [
            {"title": "ヒカリのdestination", "song": "ヒカリのdestination"},
            {"title": "虹になれ", "song": "虹になれ"},
            {"title": "Spread the Wings!!（イルミネーションスターズ Ver.）",
             "song": "Spread the Wings!!（イルミネーションスターズ Ver.）"},
            {"title": "スペシャルオーディオドラマ「輝く笑顔に向かって」", "song": None},
        ],
        "sources": [LANTIS + "lacm-14782/"],
    }
    assert "Blu-ray" not in world_file(characters).read_text(encoding="utf-8")


def test_track_lines_are_parsed_into_their_singers(world_sync, characters: CharacterConfig):
    world_sync()

    songs = songs_by_title(characters)
    assert songs["MAGICAL FOREST"]["singers"] == ["櫻木真乃"]  # 「曲名 / 角色 (CV.声优)」
    assert songs["恋するクオリア"]["singers"] == ["月岡恋鐘"]
    assert songs["ありったけの輝きで"]["singers"] == ["櫻木真乃"]  # a 歌： line
    assert songs["アポイント・シグナル"]["singers"] == ["月岡恋鐘"]
    illumination = ["櫻木真乃", "風野灯織", "八宮めぐる"]
    assert songs["ヒカリのdestination"]["singers"] == illumination  # the unit the CD is by
    assert songs["Spread the Wings!!（イルミネーションスターズ Ver.）"]["singers"] == illumination
    assert songs["MAGICAL FOREST"] == {
        "id": "MAGICAL FOREST", "title": "MAGICAL FOREST", "singers": ["櫻木真乃"],
        "special_unit": None, "releases": ["LACA-25301"], "sources": [LANTIS + "laca-25301/"],
    }
    assert "ありったけの輝きで（Off Vocal）" not in songs


def test_a_singers_line_the_page_breaks_in_two_is_read_whole(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases[1].index += [
        "5．ふたりの歌\n歌：櫻木真乃 (CV.関根 瞳)、月岡恋鐘 (CV.礒部\n花凜)\n作詞：誰か",
        "6．さんにんの歌\n歌：櫻木真乃 (CV.関根 瞳)、月岡恋鐘 (CV.礒部花凜)、\n小宮果穂 (CV.河野ひより)",
    ]

    code, _, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    assert songs["ふたりの歌"]["singers"] == ["櫻木真乃", "月岡恋鐘"]
    assert songs["さんにんの歌"]["singers"] == ["櫻木真乃", "月岡恋鐘", "小宮果穂"]


def test_tracks_numbered_m1_m2_are_read_and_credit_lines_are_no_tracks(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(LantisRelease(
        "lacm-24828", "283 Production MUSIC COLLECTION", "2026/4/22", "LACM-24828", "L'Antica",
        ["M1. One Live One Love", "M2. One Live One Love (Mortal Remix)\nリミックス：坪井リヒト"],
        artist_members="月岡恋鐘（CV.礒部花凜）、田中摩美々（CV.菅沼千紗）",
    ))

    code, _, err = world_sync()

    assert code == 0, err
    assert [t["title"] for t in release(characters, "LACM-24828")["tracks"]] == [
        "One Live One Love", "One Live One Love (Mortal Remix)",
    ]
    assert songs_by_title(characters)["One Live One Love"]["singers"] == ["月岡恋鐘", "田中摩美々"]


def test_idols_the_cd_is_by_sing_its_one_song_together_beside_their_own_versions(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(LantisRelease(
        "lacm-24531", "THE IDOLM@STER SHINY COLORS シャイニーPRオファー Vol.1", "2024/4/17", "LACM-24531",
        "櫻木真乃(CV.関根 瞳)、月岡恋鐘(CV.礒部花凜)",
        ["1．輝きにかわる", "2．輝きにかわる (櫻木真乃 Ver.)", "3．輝きにかわる (月岡恋鐘Ver.)",
         "4．輝きにかわる (Off Vocal)"],
    ))

    code, _, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    assert songs["輝きにかわる"]["singers"] == ["櫻木真乃", "月岡恋鐘"]
    assert songs["輝きにかわる (櫻木真乃 Ver.)"]["singers"] == ["櫻木真乃"]
    assert songs["輝きにかわる (月岡恋鐘Ver.)"]["singers"] == ["月岡恋鐘"]


def test_a_special_unit_s_song_is_split_into_its_idols_and_keeps_the_special_unit_s_name(
    world_sync, characters: CharacterConfig
):
    world_sync()

    song = songs_by_title(characters)["プラニスフィア ～planisphere～"]
    assert song["singers"] == ["櫻木真乃", "月岡恋鐘", "小宮果穂"]
    assert song["special_unit"] == "Team.Stella"
    assert "Team.Stella" not in [u["name"] for u in read_world(characters)["units"]]


def test_a_release_not_out_yet_is_imported_all_the_same(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    coming = date.today() + timedelta(days=60)
    sites.releases[2].date = f"{coming.year}/{coming.month}/{coming.day}"

    code, _, err = world_sync()

    assert code == 0, err
    assert release(characters, "LACA-25301")["date"] == coming.isoformat()
    assert songs_by_title(characters)["MAGICAL FOREST"]["releases"] == ["LACA-25301"]


def test_a_singer_who_is_none_of_the_idols_is_reported_and_the_song_not_written(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(LantisRelease(
        "lacm-24027", "THE IDOLM@STER シリーズ15周年記念曲「なんどでも笑おう」【シャイニーカラーズ盤】",
        "2020/9/30", "LACM-24027", "THE IDOLM@STER FIVE STARS!!!!!",
        [
            "1．なんどでも笑おう\n歌：THE IDOLM@STER FIVE STARS!!!!!",
            "2．はづきさんの歌 / 七草はづき (CV.誰か)",
            "3．ふたりの歌 / 櫻木真乃 (CV.関根 瞳)、天海春香 (CV.中村繪里子)",
        ],
    ))

    code, out, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    assert not {"なんどでも笑おう", "はづきさんの歌", "ふたりの歌"} & set(songs)
    assert [t["song"] for t in release(characters, "LACM-24027")["tracks"]] == [None, None, None]
    assert "THE IDOLM@STER FIVE STARS!!!!!" in out
    assert "七草はづき" in out
    assert "天海春香" in out


def test_fujiwarahaji_fills_in_the_singers_lantis_leaves_out(
    world_sync, characters: CharacterConfig
):
    code, out, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    assert songs["Shower of light"]["singers"] == ["櫻木真乃", "風野灯織", "八宮めぐる"]
    assert songs["Shower of light"]["sources"] == [LANTIS + "lacm-24634/", "https://fujiwarahaji.me/disc/4654"]
    assert songs["快盗Vを見逃すな"]["singers"] == ["小宮果穂"]
    ninth = songs["プラニスフィア ～planisphere～ -9 colors-"]  # ふじわらはじめ names it as first released
    assert ninth["singers"] == ["櫻木真乃", "月岡恋鐘", "小宮果穂", "八宮めぐる"]
    assert ninth["special_unit"] == "Team.Stella"
    assert "ふじわらはじめ" in out and "Shower of light" in out
    assert "Shower of light (Game Size)" not in songs


def test_where_lantis_and_fujiwarahaji_disagree_lantis_wins_and_it_is_reported(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases[3].index[0] = "1．Shower of light\n歌：イルミネーションスターズ"
    disc = sites.fuji_discs[4654]
    disc.tracks[0] = ("Shower of light", [("放課後クライマックスガールズ", ["小宮果穂"])], [], ["orig"])
    # A later version, which ふじわらはじめ keeps under the song as first released.
    sites.releases[2].index.append("4. ヒカリのdestination -5 colors- / 櫻木真乃 (CV.関根 瞳)")
    sites.fuji_discs[5000].tracks.append(("ヒカリのdestination", [], ["小宮果穂"], []))

    code, out, err = world_sync()

    assert code == 0, err
    assert songs_by_title(characters)["Shower of light"]["singers"] == ["櫻木真乃", "風野灯織", "八宮めぐる"]
    assert songs_by_title(characters)["快盗Vを見逃すな"]["singers"] == ["小宮果穂"]
    assert "冲突" in out
    conflict = next(line for line in out.splitlines() if "Shower of light" in line and "小宮果穂" in line)
    assert "櫻木真乃" in conflict
    assert songs_by_title(characters)["ヒカリのdestination -5 colors-"]["singers"] == ["櫻木真乃"]
    conflicts = section(out, "Lantis 和ふじわらはじめ冲突的地方")
    assert "ヒカリのdestination -5 colors-" in conflicts and "小宮果穂" in conflicts


def test_a_disc_fujiwarahaji_answers_empty_for_is_noted_and_its_tracks_left_unknown(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.empty.add("v4/tax?id=4654")

    code, out, err = world_sync()

    assert code == 0, err
    assert "Shower of light" not in songs_by_title(characters)
    assert "https://api.fujiwarahaji.me/v4/tax?id=4654" in out
    assert any("LACM-24634" in line and "Shower of light" in line for line in out.splitlines())


def test_songs_come_without_lyrics_or_credits_and_every_entry_has_its_source(
    world_sync, characters: CharacterConfig
):
    world_sync()

    text = world_file(characters).read_text(encoding="utf-8")
    assert "作詞" not in text and "作曲" not in text and "中村彼方" not in text
    world = read_world(characters)
    assert world["songs"] and world["releases"]
    assert all(song["sources"] for song in world["songs"])
    assert all(r["sources"] for r in world["releases"])
    assert all(
        set(song) == {"id", "title", "singers", "special_unit", "releases", "sources"}
        for song in world["songs"]
    )


def test_the_report_counts_releases_and_songs_and_what_changed(
    world_sync, sites: FakeWorldSites
):
    _, first, _ = world_sync()
    sites.releases.pop(0)

    code, second, err = world_sync()

    assert code == 0, err
    assert "唱片：4 张（第一次导入）" in first
    assert "唱片：3 张（移除 LACM-14782）" in second
    assert "歌曲：" in second and "移除 ヒカリのdestination" in second


def test_two_dates_on_one_lantis_page_are_reported_and_the_release_date_line_kept(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases[0].banner_date = "2018.07.14"

    code, out, err = world_sync()

    assert code == 0, err
    assert release(characters, "LACM-14782")["date"] == "2018-07-04"
    assert "LACM-14782" in out and "2018.07.14" in out


SIX = "、".join([
    "櫻木真乃（CV.関根 瞳）", "風野灯織（CV.近藤玲奈）", "八宮めぐる（CV.峯田茉優）",
    "月岡恋鐘（CV.礒部花凜）", "田中摩美々（CV.菅沼千紗）", "小宮果穂（CV.河野ひより）",
])
EVERYONE = ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "田中摩美々", "小宮果穂"]
L_ANTICA = ["月岡恋鐘", "田中摩美々"]


def section(out: str, heading: str) -> str:
    """The lines of the report's section that opens with `heading`."""
    lines = out.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(heading))
    end = next((i for i in range(start + 1, len(lines)) if not lines[i].startswith("  ")), len(lines))
    return "\n".join(lines[start:end])


def test_the_whole_cast_lantis_names_with_a_head_count_is_no_special_unit(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(LantisRelease(
        "laca-25133", "THE IDOLM@STER SHINY COLORS みんなのCD", "2024/5/1", "LACA-25133", "シャイニーカラーズ",
        [f"1．みんなの歌\n歌：シャイニーカラーズ(6人)\n{SIX}"],
    ))

    code, _, err = world_sync()

    assert code == 0, err
    song = songs_by_title(characters)["みんなの歌"]
    assert song["singers"] == EVERYONE
    assert song["special_unit"] is None


def test_the_whole_cast_or_one_unit_fujiwarahaji_fills_in_is_no_special_unit(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    title = "THE IDOLM@STER SHINY COLORS WING COLLECTION -A side-"
    sites.releases.append(LantisRelease(
        "laca-9946_7", title, "2023/1/18", "LACA-9946～7", "シャイニーカラーズ",
        [
            "1．Spread the Wings!! -6 colors-", "2．NEO THEORY FANTASY（2023 Ver.）",
            "3．みんなの歌 / シャイニーカラーズ",
        ],
    ))
    sites.fuji_discs[6000] = FujiDisc(6000, title, [
        ("Spread the Wings!!", [("シャイニーカラーズ(6人・新)", EVERYONE)], [], ["orig"]),
        ("NEO THEORY FANTASY", [("アンティーカ", L_ANTICA)], [], []),
        ("みんなの歌", [("シャイニーカラーズ(6人)", EVERYONE)], [], []),
    ])
    sites.fuji_songs[6001] = ("Spread the Wings!!", [6000])
    sites.fuji_songs[6002] = ("NEO THEORY FANTASY", [6000])
    sites.fuji_songs[6003] = ("みんなの歌", [6000])

    code, _, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    assert songs["Spread the Wings!! -6 colors-"]["singers"] == EVERYONE
    assert songs["Spread the Wings!! -6 colors-"]["special_unit"] is None
    assert songs["NEO THEORY FANTASY（2023 Ver.）"]["singers"] == L_ANTICA
    assert songs["NEO THEORY FANTASY（2023 Ver.）"]["special_unit"] is None
    assert songs["みんなの歌"]["singers"] == EVERYONE  # Lantis names the whole cast alone
    assert songs["みんなの歌"]["special_unit"] is None


def test_singers_lantis_names_who_are_none_of_the_idols_are_not_filled_in_by_fujiwarahaji(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    title = "THE IDOLM@STER SHINY COLORS ないしょのCD"
    sites.releases.append(LantisRelease(
        "lacm-24999", title, "2024/6/1", "LACM-24999", "THE IDOLM@STER FIVE STARS!!!!!",
        [
            "1．はづきさんの歌 / 七草はづき (CV.誰か)",
            "2．なんどでも笑おう\n歌：THE IDOLM@STER FIVE STARS!!!!!",
        ],
    ))
    sites.fuji_discs[6100] = FujiDisc(6100, title, [
        ("はづきさんの歌", [], ["櫻木真乃"], ["orig"]),
        ("なんどでも笑おう", [("シャイニーカラーズ", ["櫻木真乃", "月岡恋鐘"])], [], ["orig"]),
    ])
    sites.fuji_songs[6101] = ("はづきさんの歌", [6100])
    sites.fuji_songs[6102] = ("なんどでも笑おう", [6100])

    code, out, err = world_sync()

    assert code == 0, err
    assert not {"はづきさんの歌", "なんどでも笑おう"} & set(songs_by_title(characters))
    unmatched = section(out, "演唱者对应不到偶像名单的曲目")
    assert "はづきさんの歌" in unmatched and "七草はづき" in unmatched
    assert "なんどでも笑おう" in unmatched and "THE IDOLM@STER FIVE STARS!!!!!" in unmatched
    filled = section(out, "Lantis 没写演唱者")
    assert "はづきさんの歌" not in filled and "なんどでも笑おう" not in filled


def test_a_fujiwarahaji_disc_without_a_name_is_no_release_of_lantis_s(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(LantisRelease(
        "lacm-24998", "THE IDOLM@STER SHINY COLORS ふしぎなCD", "2024/7/1", "LACM-24998",
        "櫻木真乃（CV.関根 瞳）、月岡恋鐘（CV.礒部花凜）",
        ["1．ふしぎな歌", "2．ほかの歌"],
    ))
    sites.fuji_discs[6200] = FujiDisc(6200, "", [("ふしぎな歌", [], ["小宮果穂"], ["orig"])])
    sites.fuji_songs[6201] = ("ふしぎな歌", [6200])

    code, out, err = world_sync()

    assert code == 0, err
    assert "ふしぎな歌" not in songs_by_title(characters)
    assert "ふしぎな歌" in section(out, "哪个来源都没写演唱者的曲目")


def test_singers_told_by_another_release_s_track_keep_that_release_as_a_source(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases += [
        LantisRelease(
            "lacm-24100", "THE IDOLM@STER SHINY COLORS ふたりのCD", "2019/1/1", "LACM-24100",
            "櫻木真乃（CV.関根 瞳）、月岡恋鐘（CV.礒部花凜）",
            ["1．ふたりの約束", "2．べつの歌 / 月岡恋鐘 (CV.礒部花凜)"],
        ),
        LantisRelease(
            "lacm-24200", "THE IDOLM@STER SHINY COLORS ふたりのCD 2", "2020/1/1", "LACM-24200",
            "櫻木真乃（CV.関根 瞳）、月岡恋鐘（CV.礒部花凜）",
            ["1．ふたりの約束 / 櫻木真乃 (CV.関根 瞳)、月岡恋鐘 (CV.礒部花凜)"],
        ),
    ]

    code, _, err = world_sync()

    assert code == 0, err
    song = songs_by_title(characters)["ふたりの約束"]
    assert song["singers"] == ["櫻木真乃", "月岡恋鐘"]
    assert song["releases"] == ["LACM-24100", "LACM-24200"]
    assert set(song["sources"]) == {LANTIS + "lacm-24100/", LANTIS + "lacm-24200/"}


def lives_by_name(characters: CharacterConfig) -> dict[str, dict]:
    return {live["name"]: live for live in read_world(characters)["lives"]}


def test_lives_come_from_the_cms_with_each_day_s_performers_from_the_wiki(
    world_sync, characters: CharacterConfig
):
    code, _, err = world_sync()

    assert code == 0, err
    fourth = lives_by_name(characters)[FOURTH]
    assert fourth["sources"] == [PORTAL + "live_event/shinycolors_4th/", WIKI_LOG01]
    first_day = {k: v for k, v in fourth["days"][0].items() if k != "setlist"}
    assert first_day == {
        "date": "2022-04-23", "venue": "幕張メッセ国際展示場1~3ホール",
        "performers": ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "田中摩美々"],
        "absent": [], "sources": [WIKI_LOG01, IMASDB + "shinycolors_4th_day1.html"],
    }
    world = read_world(characters)
    assert [live["days"][0]["date"] for live in world["lives"]] == sorted(
        live["days"][0]["date"] for live in world["lives"]
    )
    assert all(live["sources"] and all(day["sources"] for day in live["days"]) for live in world["lives"])


def test_only_shiny_colors_articles_are_lives_and_its_other_articles_are_reported(
    world_sync, characters: CharacterConfig
):
    code, out, _ = world_sync()

    assert code == 0
    lives = lives_by_name(characters)
    assert "THE IDOLM@STER SideM 8thLIVE" not in lives
    assert "SideM 8thLIVE" not in out  # another brand's: not even worth reporting
    assert "283PRODUCTION COSTUME G@LLERY" not in lives  # no live: the wiki has none that day
    assert "283PRODUCTION COSTUME G@LLERY" in out
    assert "283PRODUCTION LP" not in out


def test_a_joint_live_keeps_only_shiny_colors_performers_and_reports_the_others(
    world_sync, characters: CharacterConfig
):
    code, out, _ = world_sync()

    assert code == 0
    moiw = lives_by_name(characters)[MOIW]
    assert moiw["sources"][0] == PORTAL + "live_event/idolworld2023/"
    assert [(d["date"], d["venue"], d["performers"]) for d in moiw["days"]] == [
        ("2023-02-11", "東京ドーム", ["櫻木真乃", "小宮果穂"]),
        ("2023-02-12", "東京ドーム", ["月岡恋鐘"]),
    ]
    assert "中村 繪里子（天海 春香役）" in out
    assert "天海" not in world_file(characters).read_text(encoding="utf-8")


def test_an_absence_takes_her_off_that_day_only_with_official_news_and_is_reported_without(
    world_sync, characters: CharacterConfig
):
    _, out, _ = world_sync()

    second_day = lives_by_name(characters)[FOURTH]["days"][1]
    assert "櫻木真乃" not in second_day["performers"]
    assert second_day["absent"] == ["櫻木真乃"]
    assert NEWS in second_day["sources"]
    # Without the official news, she still stood, and the report says why it was not taken.
    assert "月岡恋鐘" in second_day["performers"]
    assert "月岡恋鐘" not in second_day["absent"]
    assert "没附官方新闻链接" in out and "礒部 花凜（月岡 恋鐘役）" in out
    assert "礒部 花凜（月岡 恋鐘役）（2022/04/21出演見合わせ）" in out


def test_performers_who_are_none_of_the_idols_are_reported_but_not_the_clerk_hosting(
    world_sync, characters: CharacterConfig
):
    _, out, _ = world_sync()

    assert "田口 尚平" in out
    assert "山村 響" not in out
    assert "七草はづき" not in lives_by_name(characters)[FOURTH]["days"][0]["performers"]


def test_a_live_still_to_come_is_imported_all_the_same(world_sync, characters: CharacterConfig):
    world_sync()

    showdown = lives_by_name(characters)[SHOWDOWN]
    assert [(d["date"], d["performers"]) for d in showdown["days"]] == [
        ("2027-06-05", ["小宮果穂"]),
        ("2027-06-06", ["櫻木真乃", "風野灯織", "八宮めぐる"]),
    ]


def test_a_tour_s_days_are_at_the_venue_of_their_city(world_sync, characters: CharacterConfig):
    world_sync()

    tour = lives_by_name(characters)[TOUR]
    assert [(d["date"], d["venue"], d["performers"]) for d in tour["days"]] == [
        ("2021-04-03", "日本ガイシホール", ["櫻木真乃", "風野灯織", "八宮めぐる"]),
        ("2021-04-04", "日本ガイシホール", ["櫻木真乃"]),
        ("2021-04-24", "東京ガーデンシアター", ["月岡恋鐘"]),
    ]


def test_an_xr_live_s_performers_are_its_idols_and_a_detail_page_is_its_source(
    world_sync, characters: CharacterConfig
):
    world_sync()

    uka = lives_by_name(characters)[UKA]
    assert uka["days"][0]["performers"] == ["櫻木真乃", "風野灯織"]
    assert uka["sources"][0] == PORTAL + "live_events/283_Uka"


def test_lives_before_the_cms_come_from_the_old_official_site(
    world_sync, characters: CharacterConfig
):
    code, out, err = world_sync()

    assert code == 0, err
    lives = lives_by_name(characters)
    first = lives["THE IDOLM@STER SHINY COLORS 1stLIVE"]
    assert first["sources"] == ["https://idolmaster.jp/event/shinycolors_1st.php", WIKI_LOG01]
    assert [(d["date"], d["venue"], d["performers"]) for d in first["days"]] == [
        ("2019-03-09", "舞浜アンフィシアター", ["櫻木真乃", "風野灯織", "八宮めぐる"]),
        ("2019-03-10", "舞浜アンフィシアター", ["櫻木真乃", "風野灯織", "八宮めぐる"]),
    ]
    assert not [name for name in lives if "CINDERELLA" in name or "SideM 某公演" in name]
    assert "CINDERELLA" not in out


def test_a_live_the_wiki_says_was_called_off_is_reported_not_written(
    world_sync, characters: CharacterConfig
):
    _, out, _ = world_sync()

    assert not [name for name in lives_by_name(characters) if "SPRING PARTY" in name]
    assert "SPRING PARTY 2020" in out


def test_lives_only_the_wiki_has_are_reported_not_written(world_sync, characters: CharacterConfig):
    _, out, _ = world_sync()

    assert not [name for name in lives_by_name(characters) if "Animelo" in name]
    assert "Animelo Summer Live 2026 -Messenger-" in out


def test_the_cms_is_read_page_by_page(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.cms_page_most = 2

    code, _, err = world_sync()

    assert code == 0, err
    assert {FOURTH, MOIW, SHOWDOWN, TOUR, UKA} <= set(lives_by_name(characters))


def test_a_refused_cms_token_fails_the_import_and_keeps_the_old_file(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    world_sync()
    before = world_file(characters).read_text(encoding="utf-8")
    sites.cms_token_refused = True

    code, _, err = world_sync()

    assert code != 0
    assert "cmsapi-frontend.idolmaster-official.jp" in err
    assert world_file(characters).read_text(encoding="utf-8") == before


def test_the_report_counts_lives_and_what_changed(world_sync, sites: FakeWorldSites):
    _, first, _ = world_sync()
    sites.cms_lives = [live for live in sites.cms_lives if live.title != UKA]

    code, second, err = world_sync()

    assert code == 0, err
    assert "演出：6 场（第一次导入）" in first
    assert f"演出：5 场（移除 {UKA}）" in second


def test_days_the_wiki_has_performers_on_but_the_official_list_does_not_are_reported(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.wiki_lives[0].performers.append(("2027年6月7日(月)", ["礒部 花凜（月岡 恋鐘役）"]))

    code, out, _ = world_sync()

    assert code == 0
    assert [d["date"] for d in lives_by_name(characters)[SHOWDOWN]["days"]] == ["2027-06-05", "2027-06-06"]
    assert "2027-06-07" in out and "官方没有这一天" in out


def test_a_day_whose_listed_performers_are_none_of_the_idols_is_reported(
    world_sync, sites: FakeWorldSites
):
    sites.wiki_lives[2].performers = [("2025年5月10日(土)", ["大崎甘奈 (アイドルマスター シャイニーカラーズ/CV.黒木ほの香)"])]

    _, out, _ = world_sync()

    assert f"{UKA} 2025-05-10" in out


def test_other_dates_in_a_wiki_live_do_not_make_an_official_article_a_live(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.wiki_lives[0].performers.insert(0, (None, ["チケット一般販売：2025年3月22日(土)"]))

    world_sync()

    assert "283PRODUCTION COSTUME G@LLERY" not in lives_by_name(characters)


def test_a_date_that_does_not_exist_fails_the_import_and_keeps_the_old_file(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    world_sync()
    before = world_file(characters).read_text(encoding="utf-8")
    sites.cms_lives[1].dspdate = "2022年2月30日(土)"

    code, _, err = world_sync()

    assert code != 0
    assert "2022年2月30日" in err
    assert "Traceback" not in err
    assert world_file(characters).read_text(encoding="utf-8") == before


def write_corrections(characters: CharacterConfig, days: list[dict], not_idols: list[dict] | None = None) -> None:
    characters.write("world-corrections.json", json.dumps(
        {"live_days": days, "not_idols": not_idols or []}, ensure_ascii=False,
    ))


FUNFARE = "https://funfare.bandainamcoent.co.jp/11511/"


def test_corrections_set_a_day_s_performers_and_quiet_no_idols_and_one_matching_no_day_is_reported(
    world_sync, characters: CharacterConfig
):
    write_corrections(characters, [
        {
            "live": MOIW, "date": "2023-02-11", "performers": ["八宮めぐる"],
            "sources": [FUNFARE], "note": "wiki 的名单是旧的",
        },
        {"live": MOIW, "date": "2023-02-13", "performers": [], "sources": [FUNFARE], "note": ""},
    ], not_idols=[{"name": "田口 尚平", "note": "主持人"}])

    code, out, err = world_sync()

    assert code == 0, err
    day = lives_by_name(characters)[MOIW]["days"][0]
    assert day["performers"] == ["八宮めぐる"]
    assert day["sources"][0] == FUNFARE
    assert "中村 繪里子" not in out  # the wiki's list for the day is not read at all
    assert "人工更正" in out and f"{MOIW} 2023-02-11" in out
    assert "田口 尚平" not in out  # confirmed to be no idol
    assert "没有套用" in out and "2023-02-13" in out


def test_a_correction_with_no_performers_says_nobody_stood_that_day_and_quiets_the_report(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.wiki_lives[2].performers = []
    _, before, _ = world_sync()
    write_corrections(characters, [{
        "live": UKA, "date": "2025-05-10", "performers": [], "sources": [FUNFARE],
        "note": "闪耀色彩只出演了另一天",
    }])

    _, after, _ = world_sync()

    assert f"{UKA} 2025-05-10：" in before
    assert f"{UKA} 2025-05-10：" not in after.split("人工更正")[0]
    assert lives_by_name(characters)[UKA]["days"][0]["performers"] == []


def test_a_postponed_live_s_first_dates_on_the_wiki_are_no_conflict(
    world_sync, sites: FakeWorldSites
):
    live = sites.wiki_lives[0]
    live.title = "(延期公演) " + live.title
    live.performers.insert(0, ("2026年2月6日(土)", ["礒部 花凜（月岡 恋鐘役）"]))

    _, out, _ = world_sync()

    assert "2026-02-06" not in out


def five_stars_release() -> LantisRelease:
    return LantisRelease(
        "lacm-24027", "THE IDOLM@STER シリーズ15周年記念曲「なんどでも笑おう」【シャイニーカラーズ盤】",
        "2020/9/30", "LACM-24027", "THE IDOLM@STER FIVE STARS!!!!!",
        [
            "1．なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!",
            "2．なんどでも笑おう シャイニーカラーズVer.",
            "3．BGM「朝」",
        ],
    )


def write_track_corrections(characters: CharacterConfig, tracks: list[dict]) -> None:
    characters.write("world-corrections.json", json.dumps({"tracks": tracks}, ensure_ascii=False))


NEWS_SONG = "https://idolmaster-official.jp/news/01_2000"


def test_track_corrections_set_their_singers_and_special_unit_or_make_a_track_no_song(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(five_stars_release())
    write_track_corrections(characters, [
        {"catalog": "LACM-24027", "track": 1, "title": "なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!",
         "singers": ["櫻木真乃"], "special_unit": "THE IDOLM@STER FIVE STARS!!!!!",
         "sources": [NEWS_SONG], "note": "闪耀色彩这边只有真乃"},
        {"catalog": "LACM-24027", "track": 2, "title": "なんどでも笑おう シャイニーカラーズVer.",
         "singers": ["櫻木真乃", "月岡恋鐘"], "sources": [NEWS_SONG], "note": "当时的全体"},
        {"catalog": "LACM-24027", "track": 3, "title": "BGM「朝」", "no_song": True,
         "sources": [NEWS_SONG], "note": "器乐"},
    ])

    code, out, err = world_sync()

    assert code == 0, err
    songs = songs_by_title(characters)
    five = songs["なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!"]
    assert (five["singers"], five["special_unit"], five["sources"]) == (
        ["櫻木真乃"], "THE IDOLM@STER FIVE STARS!!!!!", [NEWS_SONG],
    )
    assert songs["なんどでも笑おう シャイニーカラーズVer."]["special_unit"] is None
    assert "人工更正" in out and "LACM-24027" in out.split("人工更正")[1]
    assert "第 1 首「なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!」\n" not in out.split("人工更正")[0]
    # A track corrected as no song is not reported as unknown.
    assert release(characters, "LACM-24027")["tracks"][2]["song"] is None
    assert "BGM「朝」" not in out.split("人工更正")[0]


def test_a_track_correction_whose_title_no_longer_matches_is_not_applied_and_reported(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    sites.releases.append(five_stars_release())
    write_track_corrections(characters, [
        {"catalog": "LACM-24027", "track": 3, "title": "なんどでも笑おう", "no_song": True,
         "sources": [NEWS_SONG], "note": ""},
    ])

    code, out, _ = world_sync()

    assert code == 0
    assert "没有套用" in out and "LACM-24027 第 3 首" in out


@pytest.mark.parametrize(
    "corrections", [
        {"live_days": [{
            "live": MOIW, "date": "2023-02-11", "performers": ["天海春香"], "sources": [FUNFARE], "note": "",
        }]},
        {"tracks": [{
            "catalog": "LACM-24027", "track": 1, "title": "なんどでも笑おう THE IDOLM@STER FIVE STARS!!!!!",
            "singers": ["天海春香"], "sources": [NEWS_SONG], "note": "",
        }]},
    ],
    ids=["live day", "track"],
)
def test_a_correction_naming_someone_who_is_none_of_the_idols_fails_the_import(
    world_sync, characters: CharacterConfig, corrections: dict
):
    world_sync()
    before = world_file(characters).read_text(encoding="utf-8")
    characters.write("world-corrections.json", json.dumps(corrections, ensure_ascii=False))

    code, _, err = world_sync()

    assert code != 0
    assert "world-corrections.json" in err and "天海春香" in err
    assert world_file(characters).read_text(encoding="utf-8") == before


def setlist(characters: CharacterConfig, live: str, day: int) -> list[dict]:
    return lives_by_name(characters)[live]["days"][day]["setlist"]


def sung(characters: CharacterConfig, live: str, day: int) -> list[tuple[str, list[str]]]:
    return [(item["title"], item["singers"]) for item in setlist(characters, live, day)]


ILLUMINATION_STARS = ["櫻木真乃", "風野灯織", "八宮めぐる"]


def test_each_day_s_setlist_comes_from_imas_db_with_who_sang_each_song(
    world_sync, characters: CharacterConfig
):
    code, _, err = world_sync()

    assert code == 0, err
    day = lives_by_name(characters)[FOURTH]["days"][0]
    assert sung(characters, FOURTH, 0)[:3] == [
        ("Dye the sky.", ["櫻木真乃", "風野灯織", "八宮めぐる", "月岡恋鐘", "田中摩美々"]),  # 全員
        ("ヒカリのdestination", ILLUMINATION_STARS),  # the unit, as it stood that day
        ("革命進化論", ["月岡恋鐘", "田中摩美々"]),  # no MC between
    ]
    assert day["setlist"][0] == {
        "title": "Dye the sky.", "singers": day["performers"], "dancers": [], "brand": None,
    }
    assert IMASDB + "shinycolors_4th_day1.html" in day["sources"]


def test_backing_dancers_and_a_medley_only_danced_to_are_not_singing(
    world_sync, characters: CharacterConfig
):
    world_sync()

    backed, danced = setlist(characters, FOURTH, 0)[3:5]
    assert (backed["title"], backed["singers"], backed["dancers"]) == (
        "アポイント・シグナル", ["月岡恋鐘"], ["田中摩美々"],
    )
    assert (danced["title"], danced["singers"], danced["dancers"]) == (
        "乱舞る (short ver.)", [], ILLUMINATION_STARS,
    )


def test_everyone_leaves_out_a_performer_who_stood_only_on_the_songs_naming_her(
    world_sync, characters: CharacterConfig
):
    world_sync()

    # Mano's CV was absent that day, and Meguru's stood only on the songs naming her.
    assert sung(characters, FOURTH, 1)[:3] == [
        ("Multicolored Sky", ["風野灯織", "月岡恋鐘", "田中摩美々"]),
        ("Daybreak Age", ["風野灯織", "八宮めぐる", "月岡恋鐘", "田中摩美々"]),
        ("虹になれ", ["風野灯織"]),
    ]


def test_singers_who_are_none_of_the_idols_or_did_not_stand_that_day_are_reported_not_written(
    world_sync, characters: CharacterConfig
):
    _, out, _ = world_sync()

    assert sung(characters, FOURTH, 1)[3:] == [
        ("ありったけの輝きで", []), ("SOLAR WAY", []), ("こいぬのうた", []),
        ("リフレクトサイン", ["風野灯織"]),
    ]
    unmatched = section(out, "曲目单里对应不到偶像名单的演唱者")
    assert f"{FOURTH} 2022-04-24 第 5 首「SOLAR WAY」：Team.Sol" in unmatched
    assert "「こいぬのうた」：西城樹里" in unmatched
    assert "「リフレクトサイン」：Team.Luna" in unmatched  # reported though another singer was told
    assert "「ありったけの輝きで」：櫻木真乃" in section(out, "曲目单里写着、但那天不在出演偶像里的演唱者")
    assert "永井真里子" not in world_file(characters).read_text(encoding="utf-8")


def test_a_joint_live_s_setlist_keeps_the_songs_shiny_colors_sang_and_marks_covers(
    world_sync, characters: CharacterConfig
):
    world_sync()

    items = setlist(characters, MOIW, 0)
    assert [(i["title"], i["singers"], i["brand"]) for i in items] == [
        ("ドレミファクトリー！", ["小宮果穂"], "シンデレラガールズ"),
        ("Resonance⁺", ["櫻木真乃", "小宮果穂"], None),
        ("ビーチブレイバー", ["小宮果穂"], None),
        ("アイ MUST GO!", ["櫻木真乃"], "THE IDOLM@STERシリーズ"),
    ]
    text = world_file(characters).read_text(encoding="utf-8")
    assert "佐々木千枝" not in text and "今井麻夏" not in text
    assert "ドレミファクトリー！" not in songs_by_title(characters)  # a cover is none of the songs


def test_a_setlist_common_to_every_show_is_each_day_s(world_sync, characters: CharacterConfig):
    world_sync()

    first = "THE IDOLM@STER SHINY COLORS 1stLIVE"
    assert sung(characters, first, 0) == [("Spread the Wings!!", ILLUMINATION_STARS)]
    assert sung(characters, first, 1) == [("Spread the Wings!!", ILLUMINATION_STARS)]


def test_a_page_of_two_days_gives_each_day_its_own_show(world_sync, characters: CharacterConfig):
    world_sync()

    assert sung(characters, TOUR, 0) == [("PRISISM", ILLUMINATION_STARS)]
    assert sung(characters, TOUR, 1) == [("スマイルシンフォニア", ["櫻木真乃"])]


def test_days_imas_db_and_the_lives_disagree_on_are_reported_not_guessed(
    world_sync, characters: CharacterConfig
):
    _, out, _ = world_sync()

    assert setlist(characters, UKA, 0) == []  # two shows on its one day
    assert setlist(characters, TOUR, 2) == []
    mismatched = section(out, "imas-db 和演出资料对不上的演出日")
    assert f"{UKA} 2025-05-10" in mismatched and "2 场公演" in mismatched
    assert "2021-04-25" in mismatched and IMASDB + "shinycolors3rd0425.html" in mismatched
    missing = section(out, "imas-db 上没有曲目单的演出日")
    assert f"{MOIW} 2023-02-12" in missing and f"{TOUR} 2021-04-24" in missing
    assert SHOWDOWN not in missing  # still to come


def test_the_report_counts_the_days_with_setlists_and_what_changed(
    world_sync, sites: FakeWorldSites
):
    _, first, _ = world_sync()
    sites.imasdb_lives = [live for live in sites.imasdb_lives if live.name != FIRST]

    code, second, err = world_sync()

    assert code == 0, err
    assert "有曲目单的演出日：7 个（第一次导入）" in first
    assert (
        "有曲目单的演出日：5 个（移除 THE IDOLM@STER SHINY COLORS 1stLIVE 2019-03-09、"
        "THE IDOLM@STER SHINY COLORS 1stLIVE 2019-03-10）"
    ) in second


def test_an_imas_db_index_without_any_live_fails_the_import(
    world_sync, sites: FakeWorldSites, characters: CharacterConfig
):
    world_sync()
    before = world_file(characters).read_text(encoding="utf-8")
    sites.imasdb_lives = []

    code, _, err = world_sync()

    assert code != 0
    assert "imas-db.jp" in err
    assert world_file(characters).read_text(encoding="utf-8") == before
