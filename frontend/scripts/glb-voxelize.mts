/**
 * 体素小人（docs/deploy.md「体素小人」）：把混元 3D 导出的带贴图 GLB 转成落地页第 5 幕用的体素文件，
 * 写到输出目录的 `<GLB 文件名>.json`（文件名就是角色标识，上传到存储桶的 `landing-voxels/<角色标识>.json`）。
 * 维护者在本地跑，不进构建；效果靠 `--preview` 投出来的正面、背面平面图用眼睛看。
 *
 *   node scripts/glb-voxelize.mts --out <输出目录> [--height 96] [--preview <预览图目录>] <GLB…>
 *
 * 做法（2026-10 原型里试出来的）：
 * - 占格：按三角面大小细分取点，落进格子；填掉六面里至少四面是实心的小坑，腰以上再填两侧两格内都是实心的细缝
 *   （发束之间的缝，不填会露出模型内部的暗色）。
 * - 上色：从 6 个方向把模型正交渲染成颜色图和深度图，每格只取从它露在外面的面看得到、深度落在这一格里的像素，
 *   按 4 位一档分桶，取权重最大那一桶的平均色。头部皮肤上比肤色暗的像素（眼睛、嘴）大幅加重。
 * - 去杂点（头上的格子不换成肤色）；一个方向都看不到的格子从周围借色。
 *
 * 需要 Node 24（直接跑 TypeScript）。退出码：0 成功；1 参数不对或读不了 GLB。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { NodeIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

/** 落地页读的体素文件。 */
export type Voxels = {
  /** 网格尺寸。 */
  size: [w: number, h: number, d: number];
  /** 脚底到头顶的格数，按它把她缩放到场景里的身高。 */
  front: number;
  /** "#rrggbb"。 */
  palette: string[];
  /** x, y, z, 调色板下标 平铺；y 朝上，+z 是她的正面，+x 是她的左手边。 */
  voxels: number[];
};

/** 渲染颜色图时每格几个像素（每边）。 */
const SUPERSAMPLE = 6;
/** 高度占比在这以上算头部：脸上的皮肤保五官，去杂点不把头上的格子换成肤色。 */
const HEAD_ABOVE = 0.66;
/** 高度占比在这以上（腰以上）填发束细缝。 */
const SLOTS_ABOVE = 0.45;
/** 正上方、正下方看到的像素的权重：从这两个方向会看进发束之间的缝。 */
const VERTICAL_VIEW_WEIGHT = 0.15;
/** 去杂点：两种颜色差多少以内算相近（RGB 距离），周围至少几格彼此相近才换。 */
const NEAR_COLOR = 40;
const DESPECKLE_QUORUM = 5;

type Rgb = [number, number, number];

const { values: args, positionals: inputs } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    height: { type: "string", default: "96" },
    preview: { type: "string" },
  },
});
const height = Number(args.height);
if (!args.out || !inputs.length || !Number.isInteger(height) || height < 8) {
  console.error("用法：node scripts/glb-voxelize.mts --out <输出目录> [--height 96] [--preview <预览图目录>] <GLB…>");
  process.exit(1);
}

type Mesh = {
  /** 世界坐标的顶点，xyz 平铺。 */
  positions: Float32Array;
  uvs: Float32Array;
  /** 三角面的顶点下标，每 3 个一面。 */
  triangles: Uint32Array;
  /** 贴图上 (u, v) 处的颜色。 */
  color: (u: number, v: number) => Rgb;
};

/** GLB 里第一个带网格的节点的第一个图元，顶点换到世界坐标；混元 3D 导出的都是脸朝 +z。 */
async function readMesh(file: string): Promise<Mesh> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prim: Primitive | undefined = node?.getMesh()?.listPrimitives()[0];
  const position = prim?.getAttribute("POSITION");
  const uv = prim?.getAttribute("TEXCOORD_0");
  const texture = prim?.getMaterial()?.getBaseColorTexture()?.getImage();
  if (!node || !prim || !position || !uv || !texture) {
    console.error(`${file}：找不到带贴图的网格`);
    process.exit(1);
  }
  const m = node.getWorldMatrix();
  const n = position.getCount();
  const positions = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const p: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = position.getElement(i, p);
    positions[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    uvs.set(uv.getElement(i, t).slice(0, 2), i * 2);
  }
  const indices = prim.getIndices();
  const triangles = indices ? Uint32Array.from({ length: indices.getCount() }, (_, i) => indices.getScalar(i)) : Uint32Array.from({ length: n }, (_, i) => i);

  const { data, info } = await sharp(Buffer.from(texture)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const color = (u: number, v: number): Rgb => {
    const x = Math.min(info.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * info.width)));
    const y = Math.min(info.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * info.height)));
    const k = (y * info.width + x) * 3;
    return [data[k], data[k + 1], data[k + 2]];
  };
  return { positions, uvs, triangles, color };
}

/** 一个方向的正交渲染：沿 `axis` 从 `sign` 那一侧看过去，每格 SUPERSAMPLE² 个像素。 */
type View = { axis: 0 | 1 | 2; sign: 1 | -1; u: number; v: number; width: number; depth: Float32Array; color: Uint8Array };

/** 每个方向的图上横、竖分别是哪根轴。 */
const PLANE: Record<0 | 1 | 2, [number, number]> = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };

const SIX = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

const isSkin = ([r, g, b]: Rgb) => r > 200 && r - b >= 15 && g / r >= 0.82 && g >= b - 5;
const luma = ([r, g, b]: Rgb | number[]) => 0.3 * r + 0.59 * g + 0.11 * b;
const distance = (a: Rgb | number[], b: Rgb | number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hexRgb = (hex: string): Rgb => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)) as Rgb;

/** (x, y, z) 周围 26 格的位置。 */
function* around26(x: number, y: number, z: number) {
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) yield [x + dx, y + dy, z + dz] as const;
}

function voxelize(mesh: Mesh, H: number): Voxels {
  const { positions: P, uvs: UV, triangles } = mesh;
  const n = P.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i * 3 + k]);
      max[k] = Math.max(max[k], P[i * 3 + k]);
    }
  const s = (max[1] - min[1]) / H;
  // 四周各留一格空，填坑、借色看邻格时不出界。
  const W = Math.ceil((max[0] - min[0]) / s) + 2;
  const Hv = H + 1;
  const D = Math.ceil((max[2] - min[2]) / s) + 2;
  const dims = [W, Hv, D];
  const key = (x: number, y: number, z: number) => (x * Hv + y) * D + z;
  const unkey = (k: number) => [Math.floor(k / D / Hv), Math.floor(k / D) % Hv, k % D];

  // 顶点在格子坐标里的位置（连续值，格子 x 占 [x, x+1)）。
  const grid = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    grid[0][i] = (P[i * 3] - min[0]) / s + 1;
    grid[1][i] = Math.min(H, (P[i * 3 + 1] - min[1]) / s);
    grid[2][i] = (P[i * 3 + 2] - min[2]) / s + 1;
  }
  const uvAt = (a: number, b: number, c: number, wa: number, wb: number, wc: number) =>
    mesh.color(UV[a * 2] * wa + UV[b * 2] * wb + UV[c * 2] * wc, UV[a * 2 + 1] * wa + UV[b * 2 + 1] * wb + UV[c * 2 + 1] * wc);

  // —— 占格：按三角面大小细分，每个小三角取重心附近的点，间距不超过半格（大三角面只取几个点会漏，后脑勺漏成一个个洞）。
  // 只取三角面里面的点，不取边上：贴图上 UV 岛之间是填充色，取在边上会采到它。每格顺带记下采到的平均色，最后兜底用。
  const occupied = new Set<number>();
  const sampled = new Map<number, number[]>();
  const edge = (i: number, j: number) => Math.hypot(grid[0][i] - grid[0][j], grid[1][i] - grid[1][j], grid[2][i] - grid[2][j]);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const m = Math.max(1, Math.ceil(Math.max(edge(a, b), edge(b, c), edge(c, a)) / 0.5));
    const sample = (wb: number, wc: number) => {
      const wa = 1 - wb - wc;
      const cell = [0, 1, 2].map((k) => Math.floor(grid[k][a] * wa + grid[k][b] * wb + grid[k][c] * wc));
      const k = key(Math.min(W - 2, cell[0]), Math.min(H, cell[1]), Math.min(D - 2, cell[2]));
      occupied.add(k);
      const rgb = uvAt(a, b, c, wa, wb, wc);
      const sum = sampled.get(k) ?? [0, 0, 0, 0];
      sampled.set(k, [sum[0] + rgb[0], sum[1] + rgb[1], sum[2] + rgb[2], sum[3] + 1]);
    };
    for (let i = 0; i < m; i++)
      for (let j = 0; i + j < m; j++) {
        sample((i + 1 / 3) / m, (j + 1 / 3) / m);
        if (i + j < m - 1) sample((i + 2 / 3) / m, (j + 2 / 3) / m);
      }
  }
  const has = (x: number, y: number, z: number) => occupied.has(key(x, y, z));

  // —— 填小坑和细缝：空格子六面里至少四面挨着实心的，填上；腰以上再填左右（或前后）两格之内都是实心的。
  const solidWithin2 = (x: number, y: number, z: number, ax: number, az: number) =>
    (has(x + ax, y, z + az) || has(x + 2 * ax, y, z + 2 * az)) && (has(x - ax, y, z - az) || has(x - 2 * ax, y, z - 2 * az));
  for (let pass = 0; pass < 3; pass++) {
    const add: number[] = [];
    for (const k of occupied) {
      const [x, y, z] = unkey(k);
      for (const [dx, dy, dz] of SIX) {
        const ex = x + dx, ey = y + dy, ez = z + dz;
        if (ex < 0 || ey < 0 || ez < 0 || ex >= W || ey >= Hv || ez >= D || has(ex, ey, ez)) continue;
        const around = SIX.filter(([ax, ay, az]) => has(ex + ax, ey + ay, ez + az)).length;
        const slot = ey > H * SLOTS_ABOVE && (solidWithin2(ex, ey, ez, 1, 0) || solidWithin2(ex, ey, ez, 0, 1));
        if (around >= 4 || slot) add.push(key(ex, ey, ez));
      }
    }
    for (const k of add) occupied.add(k);
  }

  // —— 6 个方向的正交渲染：颜色图和深度图（深度用格子坐标）。
  const views: View[] = [];
  for (const axis of [0, 1, 2] as const)
    for (const sign of [1, -1] as const) {
      const [u, v] = PLANE[axis];
      const width = dims[u] * SUPERSAMPLE;
      const size = width * dims[v] * SUPERSAMPLE;
      views.push({ axis, sign, u, v, width, depth: new Float32Array(size).fill(NaN), color: new Uint8Array(size * 3) });
    }
  for (let t = 0; t < triangles.length; t += 3) {
    const tri = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (const view of views) {
      const us = tri.map((i) => grid[view.u][i] * SUPERSAMPLE);
      const vs = tri.map((i) => grid[view.v][i] * SUPERSAMPLE);
      const ds = tri.map((i) => grid[view.axis][i]);
      const area = (us[1] - us[0]) * (vs[2] - vs[0]) - (vs[1] - vs[0]) * (us[2] - us[0]);
      if (Math.abs(area) < 1e-12) continue;
      const rows = view.depth.length / view.width;
      const x0 = Math.max(0, Math.floor(Math.min(us[0], us[1], us[2])));
      const x1 = Math.min(view.width - 1, Math.ceil(Math.max(us[0], us[1], us[2])));
      const y0 = Math.max(0, Math.floor(Math.min(vs[0], vs[1], vs[2])));
      const y1 = Math.min(rows - 1, Math.ceil(Math.max(vs[0], vs[1], vs[2])));
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const sx = px + 0.5, sy = py + 0.5;
          const b0 = ((us[1] - sx) * (vs[2] - sy) - (vs[1] - sy) * (us[2] - sx)) / area;
          const b1 = ((us[2] - sx) * (vs[0] - sy) - (vs[2] - sy) * (us[0] - sx)) / area;
          const b2 = 1 - b0 - b1;
          if (b0 < 0 || b1 < 0 || b2 < 0) continue;
          const d = b0 * ds[0] + b1 * ds[1] + b2 * ds[2];
          const k = py * view.width + px;
          // 离看的那一侧更近的面盖住远的。
          if (!Number.isNaN(view.depth[k]) && (d - view.depth[k]) * view.sign <= 0) continue;
          view.depth[k] = d;
          view.color.set(uvAt(tri[0], tri[1], tri[2], b0, b1, b2), k * 3);
        }
    }
  }

  // —— 上色：每格从它露在外面的面看得到的像素里投票。
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const colorIndex = (c: number[]) => {
    const hex = "#" + c.map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0")).join("");
    let i = paletteIndex.get(hex);
    if (i === undefined) {
      i = palette.length;
      palette.push(hex);
      paletteIndex.set(hex, i);
    }
    return i;
  };
  const colorOf = new Map<number, number>();
  for (const k of occupied) {
    const cell = unkey(k);
    const pixels: { rgb: Rgb; weight: number }[] = [];
    for (const view of views) {
      const out = [...cell];
      out[view.axis] += view.sign;
      if (has(out[0], out[1], out[2])) continue; // 这一面挨着别的格子，看不见
      const p = cell[view.axis];
      const outer = p + (view.sign > 0 ? 1 : 0);
      for (let j = 0; j < SUPERSAMPLE; j++)
        for (let i = 0; i < SUPERSAMPLE; i++) {
          const at = (cell[view.v] * SUPERSAMPLE + j) * view.width + cell[view.u] * SUPERSAMPLE + i;
          const d = view.depth[at];
          if (Number.isNaN(d) || d < p - 0.5 || d > p + 1.5) continue;
          // 离这一格朝外那一面越近越重：发束之间凹下去的缝更深，不该盖过表面。
          const weight = (view.axis === 1 ? VERTICAL_VIEW_WEIGHT : 1) * Math.exp(-Math.abs(d - outer) * 1.5);
          pixels.push({ rgb: [view.color[at * 3], view.color[at * 3 + 1], view.color[at * 3 + 2]], weight });
        }
    }
    if (!pixels.length) continue; // 下面从周围借
    const mean = [0, 1, 2].map((c) => pixels.reduce((a, p) => a + p.rgb[c], 0) / pixels.length) as Rgb;
    const meanLuma = luma(mean);
    // 头上皮肤的格子（脸）：比皮肤暗的像素（睫毛、瞳孔、嘴）票数大幅加重，缩小以后一只眼睛只剩两三格，
    // 不加重会和肤色平均掉。别处略偏向亮色：贴图里画的描线、发束间的暗线，体素小人用不着。
    const face = cell[1] > H * HEAD_ABOVE && isSkin(mean);
    const buckets = new Map<number, { weight: number; sum: Rgb; n: number }>();
    for (const { rgb, weight } of pixels) {
      const b = (rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4);
      const e = buckets.get(b) ?? { weight: 0, sum: [0, 0, 0], n: 0 };
      e.weight +=
        weight *
        (face
          ? 1 + 4 * (distance(rgb, mean) / 120) ** 1.5 + 25 * (Math.max(0, meanLuma - luma(rgb) - 20) / 100) ** 1.2
          : Math.max(0.35, 1 + (luma(rgb) - meanLuma) / 80));
      for (let c = 0; c < 3; c++) e.sum[c] += rgb[c];
      e.n++;
      buckets.set(b, e);
    }
    let best = { weight: -1, sum: [0, 0, 0] as Rgb, n: 1 };
    for (const e of buckets.values()) if (e.weight > best.weight) best = e;
    colorOf.set(k, colorIndex(best.sum.map((c) => c / best.n)));
  }

  // —— 一个方向都看不到的格子（表面比这一格深一点，落在深度窗口外）：从周围 26 格里取最多的那种颜色，一圈圈往里传。
  // 实在借不到的（周围都没颜色），用这一格采到的平均色。
  for (;;) {
    const fill: [number, number][] = [];
    for (const k of occupied) {
      if (colorOf.has(k)) continue;
      const [x, y, z] = unkey(k);
      const count = new Map<number, number>();
      for (const [ax, ay, az] of around26(x, y, z)) {
        const c = colorOf.get(key(ax, ay, az));
        if (c !== undefined) count.set(c, (count.get(c) ?? 0) + 1);
      }
      let best = -1;
      let most = 0;
      for (const [c, m] of count) if (m > most) [best, most] = [c, m];
      if (best >= 0) fill.push([k, best]);
    }
    if (!fill.length) break;
    for (const [k, c] of fill) colorOf.set(k, c);
  }
  for (const k of occupied) {
    if (colorOf.has(k)) continue;
    const sum = sampled.get(k);
    colorOf.set(k, colorIndex(sum ? sum.slice(0, 3).map((c) => c / sum[3]) : [128, 128, 128]));
  }

  // —— 去杂点：表面上一格的颜色在周围表面格子里没有相近的、而周围至少 5 格彼此相近，就换成那种颜色。
  // 只和表面上的格子比（里面一层看不见，常常也是暗的，会让杂点看起来「有同伴」）。头上的格子不换成肤色：
  // 眼睛里睫毛、瞳孔、高光颜色各不相同，在周围的肤色里都像杂点，一换就抹掉了。
  const rgbOf = (i: number) => hexRgb(palette[i]);
  const exposed = (x: number, y: number, z: number) => SIX.some(([dx, dy, dz]) => !has(x + dx, y + dy, z + dz));
  const surface = new Map<number, number>();
  for (const k of occupied) {
    const [x, y, z] = unkey(k);
    if (exposed(x, y, z)) surface.set(k, colorOf.get(k)!);
  }
  for (const [k, ci] of surface) {
    const [x, y, z] = unkey(k);
    const own = rgbOf(ci);
    const around: Rgb[] = [];
    for (const [ax, ay, az] of around26(x, y, z)) {
      const c = surface.get(key(ax, ay, az));
      if (c !== undefined) around.push(rgbOf(c));
    }
    if (around.some((c) => distance(c, own) < NEAR_COLOR)) continue;
    let best: Rgb | null = null;
    let most = 0;
    for (const c of around) {
      const m = around.filter((o) => distance(o, c) < NEAR_COLOR).length;
      if (m > most) [best, most] = [c, m];
    }
    if (!best || most < DESPECKLE_QUORUM || (y > H * HEAD_ABOVE && isSkin(best))) continue;
    colorOf.set(k, colorIndex(best));
  }

  const voxels: number[] = [];
  for (const [k, c] of colorOf) voxels.push(...unkey(k), c);
  return { size: [W, Hv, D], front: H, palette, voxels };
}

/** 正面、背面的平面图并排（每列取最靠外的那一格），放大看脸和后脑勺。 */
async function preview({ size: [W, H], palette, voxels }: Voxels): Promise<Buffer> {
  const SCALE = 5;
  const sides = await Promise.all(
    [1, -1].map((facing) => {
      const nearest = new Map<number, [number, number]>();
      for (let i = 0; i < voxels.length; i += 4) {
        const [x, y, z, c] = voxels.slice(i, i + 4);
        // 从背后看，她的左手边在画面左边。
        const k = y * W + (facing > 0 ? x : W - 1 - x);
        const depth = z * facing;
        if (!nearest.has(k) || nearest.get(k)![0] < depth) nearest.set(k, [depth, c]);
      }
      const pixels = Buffer.alloc(W * H * 3, 40);
      for (const [k, [, c]] of nearest) {
        const o = ((H - 1 - Math.floor(k / W)) * W + (k % W)) * 3;
        pixels.set(hexRgb(palette[c]), o);
      }
      return sharp(pixels, { raw: { width: W, height: H, channels: 3 } }).resize({ width: W * SCALE, kernel: "nearest" }).png().toBuffer();
    }),
  );
  return sharp({ create: { width: W * SCALE * 2 + 20, height: H * SCALE, channels: 3, background: "#282828" } })
    .composite(sides.map((input, i) => ({ input, left: i * (W * SCALE + 20), top: 0 })))
    .png()
    .toBuffer();
}

await mkdir(args.out, { recursive: true });
if (args.preview) await mkdir(args.preview, { recursive: true });
for (const input of inputs) {
  const id = path.basename(input, path.extname(input));
  const voxels = voxelize(await readMesh(input), height);
  await writeFile(path.join(args.out, `${id}.json`), JSON.stringify(voxels));
  if (args.preview) await writeFile(path.join(args.preview, `${id}.png`), await preview(voxels));
  console.log(id, { size: voxels.size, voxels: voxels.voxels.length / 4, colors: voxels.palette.length });
}
