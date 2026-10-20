# 安全策略

## 支持的版本

只修 `main` 分支的最新代码，以及 CI 从它构建、发到 GHCR 的 `:main` 镜像。旧的标签不单独打补丁，修好后请升级到最新版本（[docs/deploy.md](docs/deploy.md)「升级」）。

## 报告漏洞

**请不要开公开 issue。** 用 GitHub 的私密漏洞报告：仓库的 Security 页 → **Report a vulnerability**（[直接打开](https://github.com/Sallyn0225/eidolon-sc/security/advisories/new)）。报告只有维护者能看到。

报告里请写上：

- 受影响的功能或接口；
- 复现步骤，最好附请求或截图；
- 能造成什么后果：比如读到别人的对话或记忆、冒用别人的身份、花掉部署者或其他用户的模型额度；
- 你在哪个实例上测的（自己部署的，还是别的站点）。

测试请只在自己部署的实例上进行，不要对别人的实例做压力测试，也不要读取或改动别的用户的数据。

## 范围

在范围内：本仓库的代码和默认部署配置，例如

- Google / GitHub 登录和会话；
- 用户之间的数据隔离：对话、记忆、好感度、礼物；
- 自带密钥：用户填的密钥只存在本机浏览器，不应出现在服务器的存储或日志里；
- 后台的权限检查；
- 服务器代为发起的请求：例如按用户填的地址调用模型服务，可能被用来访问内网（SSRF）；
- 通话的信令和 TURN 凭据。

不在范围内：

- 别人部署的实例自己的配置问题，比如密钥泄露、没开 HTTPS；
- 第三方服务的漏洞，比如模型、语音、OAuth 提供方；请直接报告给对应的服务商；
- 只能影响你自己账号的问题；
- 角色被诱导说出不合人设的话、却不越权的提示词注入；这类问题欢迎开普通 issue。

## 处理

这是个人维护的项目，会尽快回复，但不承诺具体时限，也没有漏洞赏金。确认是漏洞后，会先修复并发版，再公开安全公告；你愿意的话，公告里会致谢你。

---

**English:** Please do not open a public issue for security problems. Report them privately via [GitHub's private vulnerability reporting](https://github.com/Sallyn0225/eidolon-sc/security/advisories/new). Only the latest `main` branch (and the `:main` images on GHCR) receives fixes. Please test only against an instance you deployed yourself.
