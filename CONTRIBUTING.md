# 参与贡献

这是一个人维护的项目，维护者没有余力审阅外部代码，所以**仓库不接受 Pull Request**，这个功能对外是关闭的。

下面这些方式欢迎参与：

- **报告 bug、提建议**：用 [Issues](https://github.com/Sallyn0225/eidolon-sc/issues/new/choose) 里的模板。部署和配置遇到问题，先查 [docs/deploy.md](docs/deploy.md) 和 [docs/configuration.md](docs/configuration.md)。
- **安全问题**：不要开公开 issue，按 [SECURITY.md](SECURITY.md) 私下报告。
- **自己改**：欢迎 fork。动手前留意三件事：
  - 本项目是 AGPL-3.0-or-later：修改后通过网络提供给别人用，就要向这些用户公开你修改后的源码（[LICENSE](LICENSE)、[LICENSING.md](LICENSING.md)）。
  - 通话立绘用的 Spine Runtimes 适用它自己的许可证。按字面理解，修改或开发包含 runtime 的产物的人，都需要有效的 Spine Editor 许可证（[ADR-0009](docs/adr/0009-spine-runtime-without-editor-license.md)）。
  - 剧情数据、角色音色和立绘素材不随仓库分发，也不要提交进你的公开 fork（[ADR-0003](docs/adr/0003-corpus-and-voices-stay-private.md)）。

本地开发怎么跑，见 README 的「开发」一节。

---

**English:** This is a solo-maintained project and pull requests are not accepted. Bug reports and feature requests are welcome via [Issues](https://github.com/Sallyn0225/eidolon-sc/issues/new/choose); report security problems privately as described in [SECURITY.md](SECURITY.md). Forks are welcome under the AGPL; note the separate Spine Runtimes license ([ADR-0009](docs/adr/0009-spine-runtime-without-editor-license.md)) and keep game content out of public forks ([ADR-0003](docs/adr/0003-corpus-and-voices-stay-private.md)).
