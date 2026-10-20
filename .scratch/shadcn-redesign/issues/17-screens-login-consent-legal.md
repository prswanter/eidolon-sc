# 17: 登录、同意、条款、隐私换新

**What to build:** 访客和新用户看到的登录页、同意页，以及任何人都能看的条款页、隐私页（含法务页脚、隐私联系方式）全部改用新版共用件和 shadcn 组件，整屏不再出现 Astryx 组件，视觉按 `DESIGN.md`。行为、文案不变。属于第 3 波，和 18、19 并行。

**Blocked by:** 16

**Status:** done

- [x] 这几屏和 `LegalFooter`、`PrivacyContact` 里没有 `@astryxdesign` 的引用
- [x] 验收清单第 5 行：登录页的默认状态、登录被拒绝的提示、没有可用登录方式、开发登录表单（开发环境）
- [x] 验收清单第 6 行：同意页的首次进入、提交中、提交失败
- [x] 验收清单第 7 行：条款、隐私的正文排版、标题层级、联系方式、页脚链接
- [x] 以上每行都在浅色、深色，手机宽度、电脑宽度下各看一遍
- [x] CI 的 grep 检查脚本通过
- [x] `typecheck`、`test` 通过，`next build` 成功
- [x] 开工前已把 main 合进 `feat/shadcn-redesign`，冲突在分支里解决

## Comments

2026-10-09 交付（提交 cb1d62e，合并 26c82f7）：
- 登录、同意、条款、隐私和 `LegalFooter`、`PrivacyContact` 改用新共用件和 shadcn；新加 `ui/checkbox.tsx`、`ui/spinner.tsx`（spinner 去掉英文 `aria-label`、改成 `aria-hidden`，采用 18 的版本）。
- `components/app/AppLink.tsx` 加了 `isMuted`（Meta 字号、弱化色），给页脚链接用。
- 登录被拒的提示改成中性 Alert（DESIGN.md：挂断红只给挂断和真正执行删除、封禁的那一下），和 `FailureNotice` 一致。
- 登录键：第一个 `default`，其余 `outline`；应用名用 `text-list-title`。条款、隐私的条目是 `dl` 加 `divide-y`。
- 2026-10-09 用户人工验收通过。
