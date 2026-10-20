import { describe, expect, it } from "vitest";

import { matchesSearch, type Searchable } from "@/lib/characterSearch";

const ILLUMINATION = ["illumination STARS", "いるみねーしょんすたーず"] as const;
const LANTICA = ["L'Antica", "あんてぃーか"] as const;
const HOKAGO = ["放課後クライマックスガールズ", "ほうかごくらいまっくすがーるず"] as const;
const NOCTCHILL = ["noctchill", "のくちる"] as const;
const STRAYLIGHT = ["Straylight", "すとれいらいと"] as const;

function idol(
  name: string,
  [name_zh, name_kana, name_romaji]: [string, string, string],
  [unit, unit_reading]: readonly [string, string] | readonly [null, null] = [null, null],
): Searchable {
  return { name, name_zh, name_kana, name_romaji, unit, unit_reading };
}

const ROSTER: Searchable[] = [
  idol("櫻木真乃", ["樱木真乃", "さくらぎ まの", "Sakuragi Mano"], ILLUMINATION),
  idol("八宮めぐる", ["八宫巡", "はちみや めぐる", "Hachimiya Meguru"], ILLUMINATION),
  idol("月岡恋鐘", ["月冈恋钟", "つきおか こがね", "Tsukioka Kogane"], LANTICA),
  idol("田中摩美々", ["田中摩美美", "たなか まみみ", "Tanaka Mamimi"], LANTICA),
  idol("白瀬咲耶", ["白濑咲耶", "しらせ さくや", "Shirase Sakuya"], LANTICA),
  idol("小宮果穂", ["小宫果穗", "こみや かほ", "Komiya Kaho"], HOKAGO),
  idol("西城樹里", ["西城树里", "さいじょう じゅり", "Saijo Juri"], HOKAGO),
  idol("浅倉透", ["浅仓透", "あさくら とおる", "Asakura Toru"], NOCTCHILL),
  idol("樋口円香", ["樋口圆香", "ひぐち まどか", "Higuchi Madoka"], NOCTCHILL),
  idol("芹沢あさひ", ["芹泽朝日", "せりざわ あさひ", "Serizawa Asahi"], STRAYLIGHT),
  { name: "誰か", name_zh: null, name_kana: null, name_romaji: null, unit: null, unit_reading: null },
];

/** 搜索框里是 `query` 时留下的角色，按名单的顺序。 */
function found(query: string): string[] {
  return ROSTER.filter((c) => matchesSearch(c, query)).map((c) => c.name);
}

describe("matchesSearch", () => {
  it.each(["樱木真乃", "樱木", "真乃"])("中文简体译名、只输姓或只输名都找得到：%s", (query) => {
    expect(found(query)).toEqual(["櫻木真乃"]);
  });

  it.each([
    ["八宫巡", "八宮めぐる"],
    ["巡", "八宮めぐる"],
    ["朝日", "芹沢あさひ"],
    ["圆香", "樋口円香"],
  ])("名字是假名或日文字形的，用社区通行的中文译名找得到：%s", (query, name) => {
    expect(found(query)).toEqual([name]);
  });

  it.each(["恋钟", "恋鐘", "戀鐘", "戀钟"])("繁体、日文字形和简体混着输都行：%s", (query) => {
    expect(found(query)).toEqual(["月岡恋鐘"]);
  });

  it.each(["櫻木", "櫻木真乃", "円香"])("日文原名照旧找得到：%s", (query) => {
    expect(found(query)).toHaveLength(1);
  });

  it.each(["摩美々", "摩美美", "田中摩美"])("々 和它前面的字一样：%s", (query) => {
    expect(found(query)).toEqual(["田中摩美々"]);
  });

  it.each(["まの", "マノ", "さくらぎ", "サクラギマノ", "ｻｸﾗｷﾞ"])("假名读音，平假名片假名都算：%s", (query) => {
    expect(found(query)).toEqual(["櫻木真乃"]);
  });

  it.each(["mano", "Sakuragi", "Sakuragi Mano", "mano sakuragi", "Mano Sakuragi", "sakuragimano", "SAKURAGI"])(
    "罗马字不分姓名先后、大小写和空格：%s",
    (query) => {
      expect(found(query)).toEqual(["櫻木真乃"]);
    },
  );

  it.each(["toru", "tooru", "tōru", "Tohru"])("长音的几种写法都认：%s", (query) => {
    expect(found(query)).toEqual(["浅倉透"]);
  });

  it.each(["L'Antica", "lantica", "L’Antica", "アンティーカ", "あんてぃーか"])("组合名搜出整组成员：%s", (query) => {
    expect(found(query)).toEqual(["月岡恋鐘", "田中摩美々", "白瀬咲耶"]);
  });

  it.each(["放课后", "放課後", "ほうかご"])("组合名用简体、日文或读音写都行：%s", (query) => {
    expect(found(query)).toEqual(["小宮果穂", "西城樹里"]);
  });

  it("前后多打的空格不算", () => {
    expect(found("  真乃 ")).toEqual(["櫻木真乃"]);
  });

  it.each(["", "   "])("空着时全部留下：%j", (query) => {
    expect(found(query)).toEqual(ROSTER.map((c) => c.name));
  });

  it("只输一个字母不出错，只是结果多一点", () => {
    expect(found("a")).toContain("櫻木真乃");
  });

  it.each(["佐藤", "xyz", "ぴーちゃん"])("不认识的输入什么都不留下：%s", (query) => {
    expect(found(query)).toEqual([]);
  });

  it("没配另外几种名字的角色，照旧用原名找得到", () => {
    expect(found("誰か")).toEqual(["誰か"]);
  });
});
