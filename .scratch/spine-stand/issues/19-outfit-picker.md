# 19: 用户在对话页换衣装

**What to build:** 用户在对话页页首点「换衣装」，就能从这位角色的全部衣装里挑一套：按卡片浏览，在私服和演出服之间切换，看会动的大预览，点「穿这套」后保存在这台设备上，下次打电话她就穿这套。同时，浏览器会在空闲时把当前衣装预取好。规则见 `../spec.md`「衣装与换衣装」一节；依据见「拍板：衣装在哪里选、怎么选」和「拍板：立绘在加载中、加载失败和减少动态效果时怎么表现」（`09-outfit-picker.md`、`12-stand-degraded-states.md`）。

参考：原型分支 `prototype/spine-stand` 的 `/prototype/stand?screen=picker`，里面有衣装面板的实现。

**Blocked by:** 14, 18

**Status:** resolved

- [x] **入口**：对话页页首、打电话键旁边加一个「换衣装」图标按钮（Lucide `Shirt`），只在角色有 `stand` 时显示。宽屏（≥ 768px，和对话页用同一个断点）打开弹窗，窄屏打开底部面板。通话层里没有这个入口。
- [x] **列表**：读取衣装清单，按卡片排列，顺序照清单。
  - 每张卡显示缩略图和卡名，下面一个铺满卡片宽度的「私服 / 演出」切换。
  - 只有一套的卡，显示一个灰掉的「只有一套」。
  - 所有卡片一样高；标题固定占两行，超出截断，悬停时显示全名。
- [x] **预览**：弹窗左侧、底部面板上方，放一张会动的全身大预览，配卡名、「私服/演出 · 稀有度 · 正在穿」和「穿这套」按钮。
  - 点卡片只是预览，点「穿这套」才保存。
  - 手机上预览随列表一起滚动。
  - 预览同样遵守减少动态效果。
  - 换预览时释放旧衣装的素材：从 `AssetManager` 里连条目一起删掉，旧贴图也从 `ManagedWebGLRenderingContext.restorables` 里移除。通话中的立绘引擎换衣装时，也照这样做。
- [x] **保存**：按角色各存一套，存在本机，照现有通话偏好设置的写法，防御性地读写。读到坏数据，或者清单里已经没有这套衣装时，用默认衣装。
- [x] **退回顺序**：打电话时，先加载选中的衣装，不行就换默认衣装，再不行就只显示背景图。加载失败时，不清掉本机保存的选择。
- [x] **预取**：进入对话页后，浏览器空闲时，把 runtime 和当前衣装预取进缓存；开了省流量（`navigator.connection.saveData`）就不预取，等按下打电话键再下载。
- [x] 遵守 AGENTS.md 的 Astryx 规则：卡片列表、弹窗、底部面板都用对应的 Astryx 组件。
- [x] **测试**：
  - 本机保存（照通话偏好设置的测试）：按角色分开存；坏数据时用默认衣装；清单里没有这套时用默认衣装。
  - 退回顺序和预取的判断逻辑，如果写成了纯函数，也要测。
- [x] **人工验证**：宽屏弹窗和窄屏底部面板都走一遍：换一套、打电话、确认她穿着新衣装；刷新后还记得；把选中的那套从存储桶删掉后，退回默认衣装。在 Comments 里附截图。
- [x] `npm test`、`npm run typecheck` 全部通过。

## Comments

**实现记录（2026-10-01，agent）**

- **本机保存与判断逻辑**（`frontend/src/lib/standOutfit.ts`，测试 `standOutfit.test.ts`）：
  - `readOutfitList` 防御性地读衣装清单，`url`、`thumbnail` 按清单地址解析成绝对地址，写错的衣装和一套都没有的卡去掉。
  - 选择存在 `localStorage` 的 `eidolon.standOutfits`（`{角色 id: 衣装 id}`），照 `callPreferences` 的写法：读不了、不是对象、这位角色存的不是字符串都当没选过；写不进去时不报错。
  - `wornOutfit`：清单到了，选中的那套在清单里就穿它，不在就穿默认衣装。清单还没到或者读不到时，按存储桶的布局（清单旁边的 `../spine/idols/<衣装 id>/`，docs/deploy.md「立绘素材」）直接找选中的那套，衣装 id 必须是 `stand/数字` 或 `stand_costume/数字`，否则用默认。这是 code review 指出的：原来要等清单到了才认得选中的那套，清单读不到时永远只穿默认衣装，早拨号时还会中途换衣装。
  - `outfitsToTry`（选中的，再是默认；相同时只试一次）、`shouldPrefetch`（`saveData` 为 true 时不预取）、`prefetchedFiles`（runtime 加这套衣装的 `data.json`、`data.atlas`、`data.png`）都是纯函数，有测试。
- **立绘引擎换衣装**（`StandEngine.load`）：同一个引擎上换衣装，新的一套读好了再换上，然后释放上一套：按素材目录找到 `AssetManager` 里的条目，自己 dispose 再 `delete` 条目（3.6 的 `remove` 只置 null，之后 `removeAll` 会报错）；贴图 dispose 时 runtime 自己把它移出 `restorables`（`GLTexture.dispose` 调 `removeRestorable`，已对照源码）。接连换几套时只换上最后要的那一套，同一套的并发载入共用一次下载，中途被取代的、载入失败的、数据读不了的都当场释放。新增「全身」取景给大预览用。
- **`Stand`**：收一组依次试的衣装，一套失败就试下一套；衣装变了在原来的引擎上换，不重建引擎。以前「一套都没载入」时整块去掉画布，现在只有 runtime 或 WebGL 不可用时才去掉，衣装都载入不到时画布留着但是空的（看起来一样只剩背景图），这样预览换一套还能再试。新增 `onTried` 回调，预览靠它判断画面上是不是这一套。
- **对话页**：`useStandOutfits` 读清单、读写选择、算出穿哪套和依次试的衣装；读到本机的选择就趁空闲预取（`requestIdleCallback`，Safari 退回 2 秒后），开了省流量不预取；换了衣装会预取新的那套。页首「换衣装」（Lucide `Shirt`，别名 `OutfitIcon`）只在角色有 `stand` 时出现；通话层收起时也能换，通话里的立绘当场换上。
- **面板**（`OutfitPicker.tsx`）：宽屏 `Dialog`（960 宽，左边 300 宽的全身预览，右边 `Grid`），窄屏 `BottomSheet`（tall，预览在上面随列表滚动，每行 3 张）。每张卡是 `Card`：缩略图（`loading="lazy"`，滚到了才下载）、卡名（`Text maxLines={2}` 固定两行高，截断时悬停出全名）、`SegmentedControl` 私服/演出，只有一套的是灰掉的「只有一套」。点缩略图或切换都只是预览；预览没画出这一套时「穿这套」不能点，载入失败写「这套没能载入」。清单读不到时显示「衣装没能读取」和「再试一次」。关上面板时卸下预览，引擎和素材一起释放。
- **code review 修掉的**：上面说的清单没到时认不出选中的衣装、预览载入失败时说明文字和画面对不上；选中的卡原来加一圈强调色描边，DESIGN.md 的选中态是铺她的 paper（`listRow()`），改成一致；`find`/`wornOutfit` 重复的查找合并成 `findOutfit`；DESIGN.md 补上 `OutfitIcon` 和换衣装面板。

**本机验证**（Playwright，后端和前端的开发服务器，素材先走真实 CDN，CDN 连不上后改由本地的整理目录和镜像代答）：

- 宽屏弹窗：真乃 62 张卡，40 张「只有一套」，62 张卡同样高（206px）；切到「ぐうぜんBOOKS」的演出服、穿上，本机存下 `stand_costume/1030010020`；刷新后再打开，预览和卡片都在这套上，写着「正在穿」。
- 连点 7 张卡（间隔 120ms），最后停在最后点的那张，控制台没有报错。
- 窄屏（390×844）底部面板：预览在上，随列表一起滚动。
- 打电话：通话层上她穿着演出服。把这套的文件拦成 404 再打：退回默认衣装，本机存的选择没被清掉。把衣装清单拦掉再打：照样穿选中的那套。
- 预览一套文件被拦成 404 的衣装：说明写「这套没能载入」，「穿这套」不能点。
- 预取：进入对话页约 1.2 秒后下载了 runtime 和正在穿那套的三个文件，之后打开面板时 runtime 是 304。
- 验证途中 `stand.hmhnk.top` 连不上了：先是几张缩略图 `ERR_CONNECTION_CLOSED`，之后衣装清单也连不上；本机 curl 经代理时 TLS 握手失败，原因没查（代理或 CDN 那边），与这次改动无关。

**留给人工验证**：照上面的清单在真实 CDN 上宽屏、窄屏各走一遍（换一套、打电话、刷新后还记得、把选中的那套从存储桶删掉后退回默认衣装），附截图；顺便确认 CDN 为什么连不上。

### 2026-10-01 人工验收

本机开发模式启动后端和前端，`EIDOLON_STAND_ASSETS_URL=https://stand.hmhnk.top`，素材全部走真实 CDN。CDN 这次能连上（衣装清单、立绘文件都是 200），上次连不上没有再出现。

- **把选中的那套从存储桶删掉后退回默认衣装**：用户自己验过，没有问题（没截图）。
- 其余几步由 agent 用 Playwright 走了一遍并截图（`../screenshots/`），都没有问题：
  - 宽屏（1440×900）弹窗：打开时停在上次穿的「ぐうぜんBOOKS」演出服（[19-wide-dialog-open.png](../screenshots/19-wide-dialog-open.png)）；切到「しじまに華ひととき」演出服，预览跟着换（[19-wide-dialog-preview.png](../screenshots/19-wide-dialog-preview.png)）；穿上后打电话，通话层上她穿着这套（[19-wide-call.png](../screenshots/19-wide-call.png)）；刷新后再打开，停在这套上，写着「正在穿」（[19-wide-after-reload.png](../screenshots/19-wide-after-reload.png)）。
  - 窄屏（390×844）底部面板：预览在上（[19-narrow-sheet-open.png](../screenshots/19-narrow-sheet-open.png)），滚动时预览随列表滚走（[19-narrow-sheet-scrolled.png](../screenshots/19-narrow-sheet-scrolled.png)）；换成「ほわっとスマイル」演出服（[19-narrow-sheet-preview.png](../screenshots/19-narrow-sheet-preview.png)）、穿上后打电话，她穿着这套（[19-narrow-call.png](../screenshots/19-narrow-call.png)）；刷新后还记得（[19-narrow-after-reload.png](../screenshots/19-narrow-after-reload.png)）。
- 控制台只有 `favicon.ico` 的 404，与这次改动无关。
