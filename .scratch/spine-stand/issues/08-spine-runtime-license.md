# 08: 拍板：Spine runtime 的许可证怎么处理

Type: grilling
Status: resolved
Blocked by: none

## Question

所有可以用的 runtime（spine-ts 3.6、pixi-spine）都受 Spine 许可证约束：接入的人需要有效的 Spine Editor 许可证；3.6 文件自带的许可证在没有书面许可时只允许个人或内部使用、禁止修改；本项目是 AGPL-3.0-or-later，而 runtime 不能以 AGPL 发布（见「调研：网页端怎么播放 Spine 3.6 的 stand 立绘」）。系统又是对公众开放的。怎么处理：接受这个风险、原样放在单独目录、附上它自己的许可证并加一条 AGPL 附加许可？去买 Spine Editor 许可证？还是换一种不受 Spine 许可证约束的做法？要不要写成 ADR？

## Answer

2026-09-30 与用户 grilling 定下，写成 `docs/adr/0009-spine-runtime-without-editor-license.md`：

1. **暂不购买 Spine Editor 许可证，接受风险**。被追究时再买一份（Essential 版就够）作为补救，不需要改代码。
2. **runtime 的放法**：官方 spine-ts 3.6 的 `spine-webgl.js` 原样放进 `frontend/public/vendor/spine-3.6/`（或类似的单独目录），附上它自己的 LICENSE 和一份记下来源、版本、校验和的 README，一个字都不改；页面用 `<script>` 加载，代码通过 `window.spine` 调用。
3. **AGPL**：在项目许可证里加一条 AGPL 第 7 节的附加许可，允许本项目和 Esoteric Software 的 Spine Runtimes 组合在一起、一起分发；README 声明 vendor 目录不受 AGPL 约束。用户确认目前全部代码都出自同一位版权人。这一步属于实现，写进 spec。
4. **ADR**：已写成 ADR-0009。
