import { describe, expect, it } from "vitest";

import { idolColors } from "./color";
import { prepareSpectrum, type RosterEntry } from "./spectrum";

function idol(id: string, idol_id: number | null, unit: string | null, unit_order: number | null): RosterEntry {
  return { id, name: id, color: "#ffbad6", idol_id, unit, unit_order };
}

const mano = idol("mano", 1, "illumination STARS", 0);
const hiori = idol("hiori", 2, "illumination STARS", 0);
const meguru = idol("meguru", 3, "illumination STARS", 0);
const kogane = idol("kogane", 4, "L'Antica", 1);
const mamimi = idol("mamimi", 5, "L'Antica", 1);
const luca = idol("luca", 26, "CoMETIK", 7);

const shape = (characters: RosterEntry[]) =>
  prepareSpectrum(characters).units.map((u) => [u.name, u.idols.map((i) => i.id)]);

describe("prepareSpectrum: 光谱的名单", () => {
  it("按组合的官方顺序分段，组合里按偶像编号排，和传进来的顺序无关：新加的一位排在列表末尾，也进到正确位置", () => {
    const spectrum = prepareSpectrum([luca, mamimi, meguru, kogane, mano, hiori]);
    expect(spectrum.units.map((u) => [u.name, u.idols.map((i) => i.id)])).toEqual([
      ["illumination STARS", ["mano", "hiori", "meguru"]],
      ["L'Antica", ["kogane", "mamimi"]],
      ["CoMETIK", ["luca"]],
    ]);
    expect(spectrum.idols.map((i) => i.id)).toEqual(["mano", "hiori", "meguru", "kogane", "mamimi", "luca"]);
  });

  it("没有编号的排在组合的最后，保持传进来的顺序", () => {
    const newcomer = idol("newcomer", null, "illumination STARS", 0);
    const another = idol("another", null, "illumination STARS", 0);
    expect(shape([newcomer, meguru, another, mano])).toEqual([
      ["illumination STARS", ["mano", "meguru", "newcomer", "another"]],
    ]);
  });

  it("查不到组合的排成最后一段，这一段没有组合名", () => {
    const stray = idol("stray", 30, null, null);
    expect(shape([stray, kogane, mano])).toEqual([
      ["illumination STARS", ["mano"]],
      ["L'Antica", ["kogane"]],
      [null, ["stray"]],
    ]);
  });

  it("每位偶像带上名字、编号和她的一组颜色", () => {
    const [first] = prepareSpectrum([{ ...mano, name: "櫻木真乃", color: "#FFBAD6" }]).idols;
    expect(first).toEqual({ id: "mano", name: "櫻木真乃", idolId: 1, colors: idolColors("#ffbad6") });
  });

  it("没有角色时是空的光谱", () => {
    expect(prepareSpectrum([])).toEqual({ units: [], idols: [] });
  });
});
