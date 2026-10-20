// 落地页第 4 幕的手机模型（.scratch/landing-call-phone 票 03）：把 Sketchfab 上 Ranguel 的「iPhone 17 Pro」
// （CC BY 4.0）改成 18 Pro 的银色、压缩到约 1 MB，写到 public/landing/phone/（phone.gltf 加 .bin 和 WebP 贴图）。
// 源文件不进仓库，换模型或改色后在 frontend/ 下重新跑，再跑 landing-phone-still.mjs 重新渲染静止的手机图：
//
//   node scripts/landing-phone.mjs <原始下载的 1024 GLB> [输出，默认 public/landing/phone/phone.gltf]
//   node scripts/landing-phone-still.mjs
//
// 改动（public/landing/phone/CREDITS.md 照抄一份）：
// - 铝框和背面玻璃区改成同一种银色（18 Pro 的背面玻璃和铝同色）：背面玻璃用铝的材质、粗糙一点，
//   盖在它上面的一层半透明「Glass_tint」去掉。
// - 屏幕换成模型自带的熄屏材质，另起名叫「Screen」（落地页亮屏时只点亮它，灵动岛还是熄屏材质）；
//   模型自带的壁纸贴图没人用了，被剪掉。
// - 去掉透射（KHR_materials_transmission）和镜面（KHR_materials_specular）：three.js 的透射要多画一遍，
//   落地页用不着。前玻璃留成一层半透明的反光膜。
// - 铝框和背面玻璃上那张平铺的喷砂噪点法线贴图去掉（落地页上手机最大六七百像素高，看不出来）。
// - 去掉切线、第二套 UV 和没有贴图的零件的 UV（three.js 没有切线时自己算法线贴图的方向）；网格量化
//   （KHR_mesh_quantization，法线 8 位、索引 16 位），贴图降到 512、转 WebP。
//
// 不用 meshopt、Draco 这类要在浏览器里跑 WebAssembly 解码的压缩：站点的 CSP（ADR-0017）不放行 WebAssembly。
// 也不打成一个 GLB：GLB 里的贴图 three.js 要经 blob: 地址去取，CSP 同样不放行；分开的文件是同源的普通请求。

import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsSpecular, KHRMaterialsTransmission } from "@gltf-transform/extensions";
import { dedup, getBounds, prune, quantize, reorder, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [source, out = path.join(frontend, "public", "landing", "phone", "phone.gltf")] = process.argv.slice(2);
if (!source) {
  console.error("用法：node scripts/landing-phone.mjs <原始下载的 1024 GLB> [输出]");
  process.exit(2);
}

/** 18 Pro 的银色（线性 sRGB）：铝框和背面玻璃同色。 */
const SILVER = [0.8, 0.8, 0.79, 1];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(source);
const root = doc.getRoot();
const material = (name) => {
  const m = root.listMaterials().find((x) => x.getName() === name);
  if (!m) throw new Error(`模型里没有材质「${name}」：换了模型的话，照新模型的材质名改这个脚本`);
  return m;
};
const meshesOf = (m) => root.listMeshes().flatMap((mesh) => mesh.listPrimitives().filter((p) => p.getMaterial() === m));

// —— 银色：铝框，和背面玻璃区。
const aluminum = material("Anodized_aluminum");
aluminum.setBaseColorFactor(SILVER).setMetallicFactor(1).setRoughnessFactor(0.32).setNormalTexture(null);
const frosted = material("Frosted_glass");
frosted.setBaseColorFactor(SILVER).setMetallicFactor(1).setRoughnessFactor(0.48).setNormalTexture(null);
for (const prim of meshesOf(material("Glass_tint"))) prim.dispose();

// —— 屏幕：熄屏材质，另起名「Screen」。
const off = material("OLED_off");
// 底色比熄屏材质再黑一点：一模一样的话下面的 dedup 会把两份并成一份。
const screen = off.clone().setName("Screen").setBaseColorFactor([0.01, 0.01, 0.01, 1]).setEmissiveFactor([0, 0, 0]);
for (const prim of meshesOf(material("OLED"))) prim.setMaterial(screen);

// —— 不要透射和镜面；不要切线和第二套 UV。
for (const ext of root.listExtensionsUsed()) {
  if (ext instanceof KHRMaterialsTransmission || ext instanceof KHRMaterialsSpecular) ext.dispose();
}
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    prim.getAttribute("TANGENT")?.dispose();
    prim.getAttribute("TEXCOORD_1")?.dispose();
    // 没有贴图的零件用不着 UV。
    const m = prim.getMaterial();
    if (m && !m.getNormalTexture() && !m.getBaseColorTexture()) prim.getAttribute("TEXCOORD_0")?.dispose();
  }

// —— 剪掉没人用的（壁纸贴图、OLED 材质、Glass_tint），合并重复的。
await doc.transform(prune(), dedup(), weld());

// —— 贴图降到 512（剩下的都是小零件的），转 WebP。
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 88, resize: [512, 512] }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizeNormal: 8 }),
);
// 每个零件都不到 65536 个顶点：索引用 16 位。
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    if (indices && prim.getAttribute("POSITION").getCount() < 65536) indices.setArray(Uint16Array.from(indices.getArray()));
  }
await doc.transform(prune());

// —— 写成 glTF 加旁边的 .bin 和 WebP。
root.listBuffers().forEach((buf, i) => buf.setURI(i === 0 ? "phone.bin" : `phone-${i}.bin`));
root.listTextures().forEach((tex, i) => {
  const users = root.listMaterials().filter((m) => [m.getNormalTexture(), m.getBaseColorTexture()].includes(tex));
  const slot = users.some((m) => m.getBaseColorTexture() === tex) ? "color" : "normal";
  const name = `${users.map((m) => m.getName().toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("+") || `texture-${i}`}-${slot}`;
  tex.setURI(`${name}.webp`);
});
// 换掉上一次的：只删这个目录里的模型文件（事先渲染的手机图 still.webp 不算，它由 landing-phone-still.mjs 重新渲染）。
const MODEL_FILE = /^(?!still\.webp$).*\.(gltf|bin|webp)$/;
mkdirSync(path.dirname(out), { recursive: true });
for (const f of readdirSync(path.dirname(out))) if (MODEL_FILE.test(f)) rmSync(path.join(path.dirname(out), f));
await io.write(out, doc);

const b = getBounds(root.getDefaultScene());
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const files = readdirSync(path.dirname(out)).filter((f) => MODEL_FILE.test(f)).map((f) => {
  const bytes = readFileSync(path.join(path.dirname(out), f));
  return { f, size: bytes.byteLength, gz: gzipSync(bytes, { level: 9 }).byteLength };
});
for (const { f, size, gz } of files) console.log(`  ${f}  ${kb(size)}（gzip ${kb(gz)}）`);
const total = (k) => files.reduce((a, x) => a + x[k], 0);
console.log(`写好了 ${path.dirname(out)}：${kb(total("size"))}，gzip 后 ${kb(total("gz"))}；包围盒 ${b.min.map((x) => x.toFixed(4)).join(", ")} → ${b.max.map((x) => x.toFixed(4)).join(", ")}`);
