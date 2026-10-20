# 补充调研：magpie 和 CLIProxyAPI 的「自动填写思考强度」是什么，我们要不要做

访问日期：2026-10-14。本文是 `research.md` 的补充，那里已经查清的内容（各协议怎么发强度、各网关的预算换算、CLIProxyAPI 的后缀和 Claude/Gemini 写法、magpie 的 Anthropic 写法、pi 的 `thinkingLevelMap` 和找档规则）这里不再重复，只在需要时指回去。

每条事实都附了一手来源：开源项目带固定提交和行号的源码链接、官方文档、官方 API 的实际返回。查不到的标 **未确认**。

源码链接固定到下面这些提交：

| 仓库 | 提交 | 说明 |
|---|---|---|
| yetone/magpie | `5654c8187cea04544e3b915c8bb444f2d4a873e4` | 比 `research.md` 用的 `407595b` 新，今天的 HEAD |
| router-for-me/CLIProxyAPI | `0d18d3b365be000eeaee7de4615f9da596b2059d` | 和 `research.md` 相同 |
| anomalyco/models.dev | `a938b2f6b3a28c6c542092be5c18c7b921cd24ed` | `sst/models.dev` 已重定向到这里，默认分支是 `dev` |
| earendil-works/pi | `d20c6e96625143bdb6fc533843d30601a9f6fcf8` | 和 `research.md` 相同 |
| anthropics/anthropic-sdk-python | `b4b7916deaf4e5570cd627b1ae7ee4394a4de39f` | Models API 的类型定义 |
| openai/openai-python | `86cae50785fb7b7bf2a5d2383370b214b304acd2` | 和 `research.md` 相同 |

官方接口的实测在 2026-10-14 做：models.dev `api.json`、OpenRouter `/api/v1/models` 不需要 key；Gemini 和 DeepSeek 的 `/models` 用仓库 `.env` 里的 key 调用，key 没有打印也没有写进任何文件。OpenAI 和 Anthropic 手头没有 key，只查了文档和 SDK 类型。

## 结论先行

- **两边的「自动填写」主要是给编程代理（Codex 等）填选择器，不是请求时替用户补强度。**
  - magpie 和 CLIProxyAPI 给 Codex 生成模型目录时，都会写进每个模型的 `supported_reasoning_levels` 和 `default_reasoning_level`。这样 Codex 的 `/model` 只列模型认的档位，并替用户预选一档。
  - magpie 还会在用户换模型时，把 Codex 配置里已经不适用的 `model_reasoning_effort` 改成新模型最近的一档。
- **请求时两边都夹档，但都不替没传强度的请求补默认值。**
  - magpie：取最近的一档，一样近时往高取；对它认为「只有开关、没有档位」的模型最多发 `high`。
  - CLIProxyAPI：取最近的一档，一样近时往低取；同一协议家族内，档位不支持就直接报错，跨协议家族时才夹档。
  - 两边对没带强度的请求都原样放行，不补默认。CLIProxyAPI 另有部署者手写的 `payload.default` 规则，可以在缺字段时补上。
- **能力数据的来源完全不同。**
  - magpie 什么都不写死：用 models.dev 的 `reasoning_options`，叠加上游 `/models` 里的 `supported_reasoning_levels`（只有另一个 magpie 和 Codex 的列表有这个字段），再加用户自己勾的档位。缓存过 24 小时就重新拉取。
  - CLIProxyAPI 用自己维护的注册表：编译进程序一份，运行时每 3 小时从 `router-for-me/models` 仓库拉一份。这份注册表靠人手改，近三个月有 81 次提交。
- **公共目录里有档位列表，但「默认档位」很少有，而且各来源说法互相矛盾。**
  - models.dev 有 `reasoning_options`（`toggle` / `effort.values` / `budget_tokens`），没有默认档位字段。
  - OpenRouter `/api/v1/models` 有 `reasoning.supported_efforts`、`default_effort`、`default_enabled`、`mandatory`。
  - 官方接口里，只有 DeepSeek 的 `/models` 实测返回了 `effort.supported_levels` 和 `default_level`。Anthropic Models API 文档写了按档位列出的 `capabilities.effort` 和 `capabilities.thinking.types`，但没有默认档位。Gemini 只返回一个布尔值 `thinking`。OpenAI 什么都不返回。
- **哪个数据源都会出错，网关的注册表也不例外。** 举几个和官方文档对不上的例子：
  - CLIProxyAPI 注册表给 Claude Opus 5.5、Sonnet 5.5 写了 `zero_allowed: true`，但官方说这两个模型发 `disabled` 会返回 400。
  - OpenRouter 写 Opus 5.5 的默认档是 `high`，官方说是 `medium`。
  - pi 写 Haiku 5.5 关不掉，官方说 effort ≤ high 时可以关。
  - pi 写 DeepSeek V4 Pro 没有 `low`，DeepSeek 自己的 `/models` 列了 `low`。
  - OpenRouter 写 DeepSeek V4 Pro 只有 `xhigh` / `high`。
- **网关改了名、或者是自建服务时，所有目录都查不到。** magpie 为此写了一堆按名字猜的规则：去掉 `claude-` 前缀、`(high)` 后缀、`:free`、`[1m]`，按同系列旧型号借档位，按多数服务商投票。这些规则本身就是一张要持续维护的兼容表。
- **推荐 (b) 的收窄版，排在 ADR-0019 本体实现之后做，不急。** 界面上按 models.dev 标出「这个模型支持哪些档位、能不能关」，查不到就照常全列；发出的参数不变，也不因为目录而拦保存。默认档位先不显示，因为来源互相矛盾。
  - 这样做不推翻 ADR-0019，只需要补一句。我们已经有 `price_catalog.py` 每天拉 models.dev 和 OpenRouter，多解析一个字段就够了，代价很小。
  - 不推荐 (c)：它和 ADR-0019、GLOSSARY「不会悄悄换成别的档」直接冲突，数据错了还会悄悄发错参数。
- **另一个零数据成本的改进：保存检查失败时，把服务报错里「支持哪些值」解析出来告诉用户。** magpie 就是这样读 OpenAI 的 "Supported values are: …" 的。

---

## 0. 「自动填写」可能指的几种行为

先把用户说的「自动填写」拆开，后面逐项对照：

| 编号 | 行为 | magpie | CLIProxyAPI |
|---|---|---|---|
| A | 界面或配置里**列出**模型支持的档位 | 有：提供商页逐个模型列出档位，可以勾掉一部分；网关的 `/v1/models` 和写给代理的目录都带上档位 | 有：写给 Codex 的模型目录带上档位（见 2.6）；管理界面**未确认** |
| B | **预选**一个默认档位 | 有：写给 Codex 的 `default_reasoning_level` | 有：写给 Codex 的 `default_reasoning_level` |
| C | 请求**没带**强度时，网关补一个 | 没有。只有用户给某个代理固定了强度（`AgentEfforts`）时，才用它**替换**该代理请求里的强度 | 没有，原样放行。部署者可以自己写 `payload.default` 规则来补 |
| D | 带的档位不支持时**夹到**最近的一档 | 有，一样近时往高取 | 有，一样近时往低取；同协议家族内直接报错 |
| E | 被上游拒绝后**记住并换一档重试** | 有：「关闭」被拒、Gemini 某一档被拒、某个账号的套餐不支持某档 | 没看到（**未确认**） |
| F | 能力数据从哪来 | models.dev + 上游 `/models` + 用户手勾 | 自维护注册表（编译进程序 + 每 3 小时远程拉取）+ 部署者在配置里写 |

---

## 1. magpie（yetone/magpie）

### 1.1 界面上的行为

- **README 的说法：** "Model lists come from the vendor, with names and reasoning levels filled in from models.dev, so a model released this morning is in your picker on the next refresh."（[README.md L126](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/README.md#L126)）
- **reference 文档：** "Real model lists, nothing compiled in……the models.dev catalog fills in names, reasoning efforts and the list for vendors that have none……refreshes itself in the background once it goes stale"（[docs/reference.md L62-L72](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/docs/reference.md#L62-L72)）。
- **提供商页的模型行**（[internal/gui/assets/app.js L10607-L10644](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gui/assets/app.js#L10607-L10644)）：
  - 每个模型显示一排档位复选框。
  - 档位已知的模型：勾掉一部分，就只把剩下的档位提供给代理。全部勾掉时提示 "No reasoning field sent"，从此这个模型不发任何思考字段。
  - 档位未知的模型（`m.given`）：提示 "Its reasoning levels aren't known: tick the ones it takes"，用户从 `none` 到 `max` 七档里自己勾。
  - 悬停提示里，未知时写 "Reasoning levels: none known"（[app.js L6340](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gui/assets/app.js#L6340)）。
- **对应的后端：** `SetModelEfforts`。对档位已知的模型，只能从已知档位里挑，选了别的会报错；对档位未知的模型，可以从 `Levels = none…max` 里挑（[provider/modelprefs.go L232-L292](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/modelprefs.go#L232-L292)）。文件头注释说明了这个用途（[L26-L32](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/modelprefs.go#L26-L32)）。
- **代理页：** 每个代理旁边显示当前强度（文档示例 "Codex gpt-6-astra effort medium"，[docs/reference.md L27](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/docs/reference.md#L27)）。对 Cursor 这类自己的配置写不了强度的代理，可以在 magpie 里给它固定一档（`AgentEfforts`）。网关用这一档**替换**该代理请求里的强度，没设就照代理自己发的走（[provider/agenteffort.go L12-L23](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/agenteffort.go#L12-L23)）。

### 1.2 写进代理配置：这才是「自动填写」最直接的体现

- **网关的 `/v1/models`：** 每个模型都带 `reasoning` 和 `supported_reasoning_levels`（[gateway/gateway.go L744-L749](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L744-L749)）。
- **给 Codex 生成 `models.json`**（`codexcat`）：
  - 每个模型写 `supported_reasoning_levels`，再写 `default_reasoning_level`（[codexcat/codexcat.go L120-L126](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/codexcat/codexcat.go#L120-L126)）。
  - 默认档的选法：用户在 Codex 里设过新会话强度时，取这个模型最近的一档；没设过就用 `DefaultEffort`，有 `medium` 选 `medium`，否则有 `high` 选 `high`，再否则选列表第一个（[L34-L43](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/codexcat/codexcat.go#L34-L43)、[L54-L71](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/codexcat/codexcat.go#L54-L71)）。注释说明了原因：Codex 切换模型时会采用目录里的默认档。
- **换模型时修正强度**（`settle`）：Codex 配置里的 `model_reasoning_effort` 不在新模型的档位里时，改成最近的一档；没设就保持不设，让 Codex 用模型自己的默认（[agent/codex.go L322-L347](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/agent/codex.go#L322-L347)）。

### 1.3 能力数据从哪来

**一、models.dev 是主数据源**

- **拉取：** 地址是 `https://models.dev/api.json`（[catalog/catalog.go L400](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L400)），整份存进本地缓存（[L594-L630](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L594-L630)）。本机有 OpenCode 的 models.dev 缓存时也能直接读（[L441-L454](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L441-L454)）。
- **刷新：** 超过 24 小时就算过期，常驻进程每小时检查一次；某次调用的模型查不到价格时，缓存超过 6 小时就提前刷新（[catalog/fresh.go L11-L45](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/fresh.go#L11-L45)）。
- **读哪些字段：** `reasoning`（布尔）和 `reasoning_options[]` 里 `type=="effort"` 的 `values`（[L290-L334](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L290-L334)）。`type=="budget_tokens"` 只用来判断「这是预算型模型」（[L1165-L1174](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L1165-L1174)）。**models.dev 的 `toggle` 没有读。**
- **新模型没写档位时：** 只要 models.dev 说它会思考、又写了 `family`，就借同系列、发布日不晚于它的最新模型的档位（[L336-L362](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L336-L362)）。
- **多数投票：** 同一个裸 ID 被多家服务商列出时，档位按「多数服务商给的那份」算（[L456-L584](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L456-L584)，其中投票在 L491-L500，汇总在 L558-L561）。

**二、上游自己的 `/models`**

- 文件头注释："A vendor's own /models endpoint is the truth about what it serves today; models.dev lags……lets the catalog fill in display names and reasoning levels."（[catalog/live.go L22-L25](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/live.go#L22-L25)）
- 能读出档位的字段只有 `supported_reasoning_levels`（[L664](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/live.go#L664)、[L703-L718](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/live.go#L703-L718)）。注释说明这是「另一个 magpie 和 Codex」的写法。
- `liveModel` 结构里**没有** DeepSeek 的 `effort.supported_levels`、Anthropic 的 `capabilities`、OpenRouter 的 `reasoning` 对象（[L642-L684](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/live.go#L642-L684)）。所以这几家官方给的能力数据，magpie 目前都没用。
- Copilot、Cursor、Devin、ChatGPT/Codex 账号等订阅类提供商，各有专门代码从自家接口读档位（例如 [provider/codex_models.go L195-L221](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/codex_models.go#L195-L221)）。另有少数套餐的模型表写死在代码里（例如 [provider/commandcode_plan.go L97-L153](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/commandcode_plan.go#L97-L153)）。

**三、查找顺序**（[provider/models.go L1444-L1568](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/provider/models.go#L1444-L1568)）

1. 用户标了「不接受思考参数」（`Reasonless`）：没有档位。
2. 这家提供商的模型列表（上游 `/models` 叠加 models.dev）里有这个模型：用列表里的档位。
3. 列表里没有：先找 models.dev 里这家服务商自己的条目（`ListedBy`），再找做这个模型的厂商的条目，再按多数投票（`EffortsOf`），最后按同名不同版本的旧型号借（`KinEfforts`）。
4. 都没有：用用户手勾的档位（`settings.ModelEfforts`）。

**四、模型名对不上时的猜测规则**（[catalog.go L964-L1039](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L964-L1039)）

- 去掉厂商路径（`openai/gpt-6-sol` → `gpt-6-sol`），统一小写。
- 去掉 Bedrock 的地区前缀。
- 去掉 CLIProxyAPI 式的 `(high)` 后缀和 `:free`、`:batch` 标签。
- 去掉 `[1m]` 这类窗口标记。
- 中转站加的 `claude-` 前缀：剩下的部分是已知模型时才去掉（`claude-deepseek-v4.1-flash`）。

这些规则在代码注释里大多带着 issue 号或 Discord 用户名，说明是一个个踩坑后补上的。

### 1.4 请求时怎么处理强度

- **夹档：** `fitEffort` 取模型档位里离请求档最近的一档，一样近时**往高取**；模型档位未知时原样发（[gateway/ir.go L713-L728](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/ir.go#L713-L728)，[catalog.go L1446-L1477](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/catalog/catalog.go#L1446-L1477)）。
- **只有开关的模型：** 已知「只有开关、没有档位」的模型，强度最多发 `high`（[gateway/decide.go L659-L682](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/decide.go#L659-L682)）。注释举的例子：Xiaomi 的 mimo 收到 `max` 会拒绝，而中转站给它标了 `max`。
- **发请求前的顺序**（[gateway/gateway.go L4257-L4278](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L4257-L4278)）：
  1. 客户端要求关闭、且模型档位里有 `none`：发 `none`。
  2. 用户标了 `Reasonless`：什么思考字段都不发。
  3. 其余情况：按 `fitFor` 夹档。
- **不带强度的请求：** 上面这段只在 `req.Effort != ""` 时才处理，**不补默认值**。
- **被拒后记住并重试：**
  - 「关闭」被拒（GLM-5.3 那类始终思考的模型）：记下来，改发最低档重试，以后都这样发（[L4308-L4313](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L4308-L4313)、[L4441-L4448](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L4441-L4448)、[L5593-L5602](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L5593-L5602)）。
  - Gemini 兼容接口拒绝某个 thinking level：记下来，换剩下最近的一档重试（[L4449-L4462](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L4449-L4462)）。
  - 订阅账号的套餐不支持某档：解析 OpenAI 报错 "Unsupported value: 'high' is not supported……Supported values are: …"，从中取出支持的档位，换别的账号；都不行就告诉代理 "pick a lower effort or another account"（[gateway/effort_accounts.go L92-L163](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/effort_accounts.go#L92-L163)、[gateway.go L2627-L2644](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/gateway.go#L2627-L2644)）。

### 1.5 未知模型

- **档位查不到：** 请求的档位原样发出（`NearestEffort` 在 `levels` 为空时返回原值）。界面显示 "none known"，让用户自己勾。
- **刷新：** models.dev 一刷新，新模型就有了档位。代码注释说明，Codex 的配置会在下一次同步时修正（[agent/codex.go L1175-L1179](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/agent/codex.go#L1175-L1179)）。

---

## 2. CLIProxyAPI（router-for-me/CLIProxyAPI）

### 2.1 注册表里每个模型的 thinking 能力字段

`ThinkingSupport` 一共五个字段（[internal/registry/model_registry.go L142-L156](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/model_registry.go#L142-L156)）：

- `min` / `max`：预算范围。
- `zero_allowed`：能不能发 0，也就是关闭。
- `dynamic_allowed`：能不能发 -1，也就是让模型自己决定。
- `levels`：离散档位。

`ModelInfo.Thinking` 为 nil 表示不支持思考（[L96-L98](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/model_registry.go#L96-L98)）。**没有「默认档位」字段。**

样例（[internal/registry/models/models.json](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/models/models.json)）：

- `claude-opus-5-5`：`zero_allowed:true, dynamic_allowed:true, levels:[low…max]`（[L298-L307](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/models/models.json#L298-L307)）。
- `kimi-k3`：`zero_allowed:true, levels:[low, high, max]`（[L3900-L3906](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/models/models.json#L3900-L3906)）。
- `gpt-6-astra`：`levels:[low…max]`，不含 `none`（[L2777-L2799](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/models/models.json#L2777-L2799)）。
- 覆盖面（按今天的文件统计）：claude 19 个模型，gemini 13，vertex 21，gemini-cli 7，aistudio 15，codex 各套餐 5–9，kimi 10，antigravity 11，xai 12，meta 7。**没有 DeepSeek、Qwen、GLM、豆包、OpenRouter 的条目。**

### 2.2 数据从哪来、多久更新一次

- **两份数据：** 程序里编译进一份（`//go:embed models/models.json`），启动后立即、之后每 3 小时，从 `https://raw.githubusercontent.com/router-for-me/models/refs/heads/main/models.json` 或 `https://models.router-for.me/models.json` 拉一份覆盖（[internal/registry/model_updater.go L16-L25](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/model_updater.go#L16-L25)、[L62-L74](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/registry/model_updater.go#L62-L74)）。Codex 客户端用的模型目录 `codex_client_models.json` 也是同样的拉法。
- **维护方式：** `router-for-me/models` 仓库的描述是 "Model List of CLIProxyAPI"，靠人手改。`gh api repos/router-for-me/models/commits?since=2026-07-14` 返回 **81 次提交**，最近一周几乎每天都有。提交信息都是「Add Gemini 4 Argon model entry」「restore claude-haiku-5-5 model entry」「remove unnecessary thinking parameters」这类。
- **编译进程序的那份：** 在 CLIProxyAPI 仓库里，近三个月有 **50 次提交**改过 `internal/registry/models/models.json`，分布在 29 天里；近一个月 20 次。
- 结论：能力数据**写死在仓库里，靠人追新模型**。远程拉取只是把「发版」换成了「改另一个仓库」。

### 2.3 `validate.go` 的夹档逻辑

见 [internal/thinking/validate.go L38-L191](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/validate.go#L38-L191)：

- **模型没有 Thinking 能力，而请求要思考：** 报错 `ErrThinkingNotSupported`（L49-L54）。
- **什么时候夹档、什么时候报错**（L56-L77、L132-L145）：
  - 来源协议和目标协议**不同家族**时（例如 OpenAI 格式的请求发往 Gemini），或者模型本身和协议对不上时（例如 Kimi 走 Claude 兼容的 `/v1/messages`），不支持的档位夹到最近的一档。
  - **同家族内**发了不支持的档位，直接报错："level %q not supported, valid levels: …"。
- **夹档规则：** `clampLevel` 按 `minimal < low < medium < high < xhigh < max` 找最近的一档，**一样近时往低取**（L239-L285），和 magpie 相反。
- **预算超出范围：** 同家族时报错，跨家族或者来自模型名后缀时夹到范围内（L79-L83、L147-L155、L287-L336）。
- **`auto`：** 模型不支持动态预算时，档位型模型换成 `medium`，预算型模型换成 `(min+max)/2`（L157-L167、L193-L237）。
- **`none`：**
  - 目标是 Claude 时保持关闭，后续写成 `thinking.type:"disabled"`（L169-L173，[provider/claude/apply.go L86-L96](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/provider/claude/apply.go#L86-L96)）。
  - 其他目标：模型「关不掉」（`!zero_allowed` 且档位里没有 `none`）时，改发档位表里的第一档（L180-L187）。
- **跨协议的高档：** `xhigh` / `max` 先在 `xhigh`、`max`、`high` 里按顺序找模型支持的那一档（[apply.go L362-L364](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L362-L364)、[L415-L448](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L415-L448)）。

### 2.4 用户不传强度时会不会补默认值

- **网关本身不补。** 请求里没有思考配置时原样放行，日志写 "thinking: no config found, passthrough"（[apply.go L341-L361](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L341-L361)）。用户自定义的模型同样如此（[L540-L546](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L540-L546)）。
- **部署者可以自己写规则来补：** `payload.default` 规则 "only set parameters when they are missing in the payload"，可以按模型名通配、协议、请求头、请求体字段匹配，示例就是给 `gemini-2.5-pro` 补 `thinkingBudget: 32768`。另有 `override` 规则强制覆盖，示例是给 `gpt-*` 写死 `reasoning.effort: "high"`（[config.example.yaml L239-L287](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/config.example.yaml#L239-L287)）。这是部署者手写的规则，不是按能力表自动补。

### 2.5 未知模型、部署者自己配的模型

- **注册表里查不到的模型：** 当作用户自定义模型处理，不校验，原样交给上游去判断（[apply.go L114-L128](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L114-L128)、[L153-L158](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/thinking/apply.go#L153-L158)）。
- **配置文件里写的 API key 模型**（gemini / claude / codex 等）：用去掉后缀的上游模型名去注册表里查能力，配置里写了 `thinking` 就以配置为准（[internal/modelconfig/model_info.go L10-L27](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/modelconfig/model_info.go#L10-L27)）。配置里的 `levels` 写了 `none`，就等于 `zero_allowed`；写了 `auto`，就等于 `dynamic_allowed`（[L29-L55](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/modelconfig/model_info.go#L29-L55)）。
- **`openai-compatibility`（任意兼容服务）里的模型，没写 `thinking` 时默认当作只支持 `low` / `medium` / `high`：** 见 [sdk/cliproxy/service_models.go L846-L849](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/sdk/cliproxy/service_models.go#L846-L849)、[sdk/cliproxy/auth/api_key_model_capabilities.go L437-L444](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/sdk/cliproxy/auth/api_key_model_capabilities.go#L437-L444)、[config_types.go L963-L965](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/config/config_types.go#L963-L965)。
  - 示例配置的注释原文："omit to default to levels ["low","medium","high"]. Exceeding levels (e.g. "max", "xhigh") are clamped to "high"; explicitly declare levels here if the upstream supports them"（[config.example.yaml L865](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/config.example.yaml#L865)）。
  - 也就是说，部署者不写能力时，`max` 会被**悄悄降成 `high`**。是否真的夹档，取决于 2.3 的跨家族判断：OpenAI 格式发往 `openai-compatibility` 类型的模型时，`modelFamilyMismatch` 为真，所以会夹档。这一点是读代码推出来的，**没有实测**。

### 2.6 写给 Codex 的模型目录：另一处「自动填写」

`applyCodexClientThinkingMetadata` 按模型的 `Levels` 写出 `supported_reasoning_levels`。默认档的选法：有 `medium` 就选 `medium`，否则选第一个不是 `none` 的档（[internal/client/codex/models/models.go L806-L841](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/client/codex/models/models.go#L806-L841)）。同一个别名下有多个上游时，取各上游档位的交集（[L452-L512](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/internal/client/codex/models/models.go#L452-L512)）。和 magpie 的 `codexcat` 是同一类功能。

### 2.7 注册表里和官方文档对不上的值

- **`claude-opus-5-5` 和 `claude-sonnet-5-5` 都写了 `zero_allowed:true`。** 但 `research.md` 1.3 引用的 Anthropic 官方表格写的是：这两个模型发 `thinking:{type:"disabled"}` 都返回 400（Sonnet 5.5 只能用 `between_tools`）。照 2.3 的代码，用户发 `none` 时 CLIProxyAPI 会给这两个模型发 `disabled`。这是读代码加文档推出来的，**没有实测**。
- **`kimi-k3` 写了 `zero_allowed:true`。** `research.md` 3.4 引用的 Kimi 官方文档写的是 K3 始终思考、不支持 `thinking` 参数。

这几处说明，网关自己维护的注册表同样会出错，而且出错时是「悄悄发错参数」。

---

## 3. 其他能拿来用的模型能力数据源

### 3.1 models.dev（anomalyco/models.dev，原 sst/models.dev）

- **字段：** `reasoning_options` 是一个数组，元素是下面三种之一（[packages/core/src/schema.ts L25-L71](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/schema.ts#L25-L71)）：
  - `{type:"toggle"}`
  - `{type:"effort", values:[…]}`：`values` 取自 `none / minimal / low / medium / high / xhigh / max / default`，也可以是 `null`。
  - `{type:"budget_tokens", min?, max?}`
- **强制性：** `reasoning=true` 的条目**必须**写 `reasoning_options`；`reasoning=false` 的条目不许写（[L258](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/schema.ts#L258)、[L317-L335](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/schema.ts#L317-L335)）。
- **各种写法的含义**（[AGENTS.md L182-L244](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/AGENTS.md#L182-L244)）：
  - 能不能关：effort 里有 `none` 就只写 effort、不写 toggle；有单独的开关又有分档时，写 `toggle` 加实际档位；只有开关时只写 `toggle`。
  - 空数组 `[]` 表示 "no caller control"（始终开、调用方控制不了）。原文强调空数组 "not uncertainty"。
  - **每家服务商单独写**：同一个模型在官方 API 和在中转站可以不一样，中转站要照抄底层模型和同类服务商的写法。
- **没有「默认档位」字段。** 枚举里的 `default` 是一个可以发出去的字面值（今天只有 groq 的两个 Qwen 用了，例如 `["none","default","low","medium","high"]`），不表示默认档。
- **数据怎么来：**
  - 多数是人工提 PR。
  - 另有每小时一次的同步任务（[.github/workflows/sync-models.yml](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/.github/workflows/sync-models.yml)，`cron: "17 * * * *"`）：
    - Anthropic 的档位直接取 Models API 的 `capabilities.effort`（[packages/core/src/sync/providers/anthropic.ts L257-L278](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/sync/providers/anthropic.ts#L257-L278)）。
    - OpenRouter 的档位 "Prefer OpenRouter's live reasoning metadata over authored options"，由 `supported_efforts` 和 `mandatory` 换算出 `toggle` 和 effort（[sync/providers/openrouter.ts L269-L273](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/sync/providers/openrouter.ts#L269-L273)、[L379-L403](https://github.com/anomalyco/models.dev/blob/a938b2f6b3a28c6c542092be5c18c7b921cd24ed/packages/core/src/sync/providers/openrouter.ts#L379-L403)）。
  - 2026-10-07 到 10-13，每天 54–113 次提交（`gh api repos/sst/models.dev/commits?since=…`）。
- **覆盖面**（2026-10-14 实测 `https://models.dev/api.json`）：
  - 总量：229 家服务商，8833 个条目；其中 `reasoning=true` 的 6527 个都带 `reasoning_options`。
  - 各类写法：有 effort 列表的 4182 个，带 `toggle` 的 1436 个，带 `budget_tokens` 的 610 个，空数组 1199 个。
  - 我们关心的几家：

    | 服务商 | 条目数 | 会思考 | 有 effort 列表 | `api` 字段（用于按地址匹配） |
    |---|---|---|---|---|
    | openai | 53 | 33 | 33 | 无 |
    | anthropic | 17 | 17 | 13 | 无 |
    | google | 40 | 30 | 18 | 无 |
    | deepseek | 4 | 4 | 4 | `https://api.deepseek.com` |
    | moonshotai | 4 | 4 | 1 | `https://api.moonshot.ai/v1` |
    | zhipuai | 17 | 17 | 4 | `https://open.bigmodel.cn/api/paas/v4` |
    | alibaba-cn | 91 | 53 | 8 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
    | volcengine | 16 | 16 | 14 | `https://ark.cn-beijing.volces.com/api/v3` |
    | minimax | 7 | 7 | 0 | `https://api.minimax.io/anthropic/v1` |

  - 火山方舟的条目用带日期的模型名（例如 `doubao-seed-2-1-pro-260628`）。方舟用户常用的推理接入点 ID（`ep-…`）在目录里查不到。

### 3.2 OpenRouter `/api/v1/models`

- **字段**（官方文档 [Reasoning Tokens「Discovering per-model reasoning options」](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)）：每个模型可以带一个 `reasoning` 对象。
  - `supported_efforts`：从高到低排列；为 `null` 表示网关的所有档位都接受；不出现表示不提供档位选择。
  - `default_effort`："Pre-select this effort when enabling reasoning"。
  - `default_enabled`：用户没设 `reasoning.enabled` 时，默认开还是关。
  - `supports_max_tokens`：能不能按预算控制。
  - `mandatory`："hide disable controls and do not send `effort: "none"` — the model rejects it"。

  这正是为「做界面提示」设计的字段。
- **`supported_parameters`：** 实测 462 个模型里，332 个含 `reasoning`，206 个含 `reasoning_effort`。它只说明「接受这个参数」，不说明接受哪些值。
- **实测覆盖**（2026-10-14）：
  - 462 个模型里有 328 个带 `reasoning` 对象，都有 `mandatory`；201 个有 `supported_efforts` 和 `default_effort`；162 个有 `default_enabled`；11 个有 `supports_max_tokens`。
  - 按服务商分的 `/api/v1/models/{id}/endpoints` 没有 `reasoning` 对象（实测 `moonshotai/kimi-k3`）。所以档位是 OpenRouter 统一接口这一层的说法，不保证和某一家上游一致。
- **抽查和官方的差异：**
  - `anthropic/claude-opus-5.5` 的 `default_effort:"high"`，Anthropic 官方是 `medium`（`research.md` 1.3）。
  - `moonshotai/kimi-k3` 的 `mandatory:false`，Kimi 官方说 K3 始终思考。
  - `deepseek/deepseek-v4-pro` 的 `supported_efforts:["xhigh","high"]`，DeepSeek 自己的 `/models` 是 `low/high/max`（见 3.3）。

### 3.3 各家官方 `/models` 接口

| 服务 | 有没有思考能力信息 | 来源 |
|---|---|---|
| OpenAI `/v1/models` | **没有**。`Model` 只有 `id`、`created`、`object`、`owned_by`、`shutdown_date` | [openai-python `types/model.py` L11-L27](https://github.com/openai/openai-python/blob/86cae50785fb7b7bf2a5d2383370b214b304acd2/src/openai/types/model.py#L11-L27)（由官方 OpenAPI 生成）。没有 key，没有实测 |
| Anthropic Models API（`GET /v1/models`、`/v1/models/{id}`） | **有档位和开关，没有默认档**。`capabilities.effort` 按档位给出 `low` / `medium` / `high` / `xhigh` / `max` 各自的 `supported`；`capabilities.thinking.types` 给出 `adaptive` / `enabled` / `disabled` 各自的 `supported`，其中 `disabled` 的原文是 "False exactly when a request that sends it gets a 400 from this model"。**没有 `between_tools`，也没有默认 effort** | [List Models](https://platform.claude.com/docs/en/api/models/list)、[Get a Model](https://platform.claude.com/docs/en/api/models/retrieve)；SDK [effort_capability.py L9-L28](https://github.com/anthropics/anthropic-sdk-python/blob/b4b7916deaf4e5570cd627b1ae7ee4394a4de39f/src/anthropic/types/effort_capability.py#L9-L28)、[thinking_types.py L7-L30](https://github.com/anthropics/anthropic-sdk-python/blob/b4b7916deaf4e5570cd627b1ae7ee4394a4de39f/src/anthropic/types/thinking_types.py#L7-L30)。没有 key，**实际返回值未确认** |
| Gemini 原生 `models.list` / `models.get` | **只有布尔值 `thinking`**（"Whether the model supports thinking"） | [Models API 文档](https://ai.google.dev/api/models)。实测：63 个模型，`gemini-4-argon`、`gemini-3.8-flash`、`gemini-2.5-pro` 都只返回 `thinking: true`；TTS 模型没有这个字段 |
| Gemini OpenAI 兼容 `/v1beta/openai/models` | **没有**。实测每个模型只有 `id`、`object`、`owned_by`、`display_name` | 实测 |
| DeepSeek `/models` | **有档位和默认档**。实测返回 `effort:{supported_levels:["low","high","max"], default_level:"high"}`（`deepseek-flash`、`deepseek-v4-pro` 都是这样）。文档原文：`supported_levels` 是 "the values accepted by the reasoning_effort parameter; `none`, which turns thinking mode off, is not included"；`default_level` 是 "The effort level the server uses when thinking mode is enabled and the request does not specify one" | [List Models](https://api-docs.deepseek.com/api/list-models)，实测 |

补充：DeepSeek 不在 `supported_levels` 里的档位并不会报错。`research.md` 3.2 引用的官方说明是 `medium`、`xhigh` 会被当作 `high`。所以「不在列表里」不等于「会被拒绝」，界面上只能写成「官方列出的档位」，不能写成「其余档位会失败」。

Kimi、GLM、Qwen、豆包的 `/models` 有没有能力字段，没有去查，**未确认**。

### 3.4 pi 的模型数据怎么生成

- **生成脚本拉这些来源**（[scripts/generate-models.ts](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts)）：
  - models.dev `api.json`（[L1741-L1746](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L1741-L1746)）。
  - OpenRouter `/api/v1/models`（[L1314-L1319](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L1314-L1319)）。
  - Vercel AI Gateway `/v1/models`（[L1365](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L1365)）。
  - NVIDIA NIM `/models`（[L1295](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L1295)）。
  - 另外还有 Radius 等。
- **怎么换算成档位表：**
  - models.dev 的 effort 列表直接变成 `thinkingLevelMap`：列表里有 `none`，`off` 就映射为 `"none"`，否则为 `null`；不在列表里的档位映射为 `null`（[scripts/models-dev-reasoning-options.ts L18-L30](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/models-dev-reasoning-options.ts#L18-L30)）。**`toggle` 不参与。**
  - OpenRouter 的 `supported_efforts` 走同一个函数；`mandatory` 决定 `off` 能不能用（[scripts/openrouter-reasoning-options.ts L11-L23](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/openrouter-reasoning-options.ts#L11-L23)）。**`default_effort` 没有用上。**
  - 再叠加大量按模型 ID 写的规则，例如 `supportsOpenAiXhigh`、`supportsOpenAiMax` 按 `gpt-5.2` 到 `gpt-6` 的名字判断（[L578-L597](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/scripts/generate-models.ts#L578-L597)）。
- **什么时候生成：**
  - 构建时：`build = generate-models && build:offline`，`prepublishOnly` 会触发构建（[package.json L58-L68](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/packages/ai/package.json#L58-L68)）。
  - 生成结果 `src/providers/data/` 被 `.gitignore` 排除（[.gitignore L11](https://github.com/earendil-works/pi/blob/d20c6e96625143bdb6fc533843d30601a9f6fcf8/.gitignore#L11)），但会复制进 npm 包的 `dist/providers/data/`。
  - **运行时不再拉取**：数据随 npm 发版更新。最新版 `@earendil-works/pi-ai@1.2.0` 发布于 2026-10-12。
- **`research.md` 4.6 留下的「未确认」，现在可以从 npm 包里直接读出来**（`dist/providers/data/*.json`）：

  | 模型 | pi 1.2.0 的 `thinkingLevelMap` |
  |---|---|
  | claude-opus-5-5 / sonnet-5-5 / haiku-5-5 | `off:null, minimal:null`，low–max 原样 |
  | claude-sonnet-4-5、gemini-2.5-pro | `null`（走预算） |
  | gpt-6-astra（Responses） | `off:null, minimal:null`，low–max 原样 |
  | deepseek-flash | `low, high, max`，`medium:null` |
  | deepseek-v4-pro | 只有 `high, max`，`low:null` |
  | kimi-k3 | `off:null`，`low, high, max` |
  | gemini-3.8-flash | `off:null`，`low, medium, high` |

### 3.5 同一批模型，各来源怎么说

「官方」一列取自 `research.md` 引用的官方文档，以及本文 3.3 的实测。✗ 表示和官方不一致。

| 模型 | 官方 | models.dev | OpenRouter | CLIProxyAPI 注册表 | pi 1.2.0 |
|---|---|---|---|---|---|
| Claude Opus 5.5 | low–max；关不掉；默认 medium | low–max，无 toggle（关不掉） | low–max，`mandatory:true`，默认 **high** ✗ | low–max，`zero_allowed:true` ✗ | low–max，off 不可用 |
| Claude Sonnet 5.5 | low–max；只能用 `between_tools` 关；默认 high | low–max，无 toggle | low–max，`mandatory:true`，默认 high | `zero_allowed:true` ✗ | off 不可用 |
| Claude Haiku 5.5 | effort ≤ high 时可以 `disabled`；默认 medium | `toggle` + low–max | `mandatory:false`，默认 medium | `zero_allowed:true` | off 不可用 ✗ |
| GPT-6 Astra | 发 `none` 会 400 | low–max | low–max，`mandatory:true`，默认 medium | low–max | low–max，off 不可用 |
| DeepSeek V4 Pro | none / low / high / max；默认 high；`/models` 列 low / high / max | `toggle` + low / high / max | 只有 xhigh / high ✗ | 无条目 | 只有 high / max ✗ |
| Kimi K3 | 始终思考；low / high / max；默认 max | low / high / max，无 toggle | `mandatory:false` ✗，默认 max | `zero_allowed:true` ✗ | off 不可用 |
| Gemini 3.8 Flash | 关不掉；`minimal` 会报错；默认 medium | low / medium / high | `mandatory:true`，默认 medium | low / medium / high + 预算 128–65535 | low / medium / high |

几个结论：

- models.dev 在这批模型上和官方最接近，但表达不了 Sonnet 5.5 的 `between_tools`，也没有默认档。
- OpenRouter 有默认档，但默认档本身就有错。
- 各来源都会出错，而且出错的地方各不相同。没有哪一份可以拿来当「请求时改参数」的依据。

---

## 4. 对我们的建议

### 4.1 我们的场景和网关有什么不同

- **选档位的人，就是配模型的人，而且是在保存的时候选。** 网关的夹档和预选默认档，是为了让编程代理在用户不知情的情况下也能发出模型认的档位（Codex 默认发 `medium`，代理的设置可能比当初选的模型活得更久，见 [magpie ir.go L713-L717](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/ir.go#L713-L717) 的注释）。我们没有这个问题。
- **我们有保存时的检查**（ADR-0019 要求每一档都把工具调用完整走一遍）。这份检查本身就是对「这个 `base_url` 加这个模型名」的实测，比任何目录都准，网关改名、自建服务也照样能测。
- **我们的 `base_url` 可能本身就是 magpie、CLIProxyAPI、new-api 这类网关。** 它们会再夹一次档或改写参数，见 2.3、2.5，以及 `research.md` 4.3、4.4。我们这边再做一层夹档，只会让「到底发了什么」更难查。
- **我们已经有现成的目录基础设施。** `backend/src/eidolon/price_catalog.py` 每天从 models.dev 和 OpenRouter 拉一次目录存进数据库，有一套「按地址找服务商，找不到就按厂商找；模型名去路径、去 `:tag`、点换横线」的匹配逻辑（L1-L13、L29-L30、L56-L65、L261-L292），写法就是照 magpie 的 `internal/catalog` 来的。

### 4.2 各做法的代价和收益

**(a) 维持 ADR-0019，不做自动填写**

- 代价：零。
- 收益：行为最简单、可预测。
- 缺点：部署者或用户第一次选错档（例如给 Opus 5.5 选了「关闭」，给 GPT-6 Astra 选了 `none`，给 Kimi K3 选了「中」）时，要等检查报错才知道，而且只能一档一档试。
- ADR：不改。

**(b) 只做界面提示，发出去的参数不变**

- **做法：**
  - 在 `price_catalog` 解析 models.dev 时，顺带把 `reasoning` 和 `reasoning_options` 存下来。
  - 用和价格相同的匹配逻辑（`find(host, model)`），给后台的模型槽位和用户的自带 LLM 设置页提供一个只读查询。用户这边只需要传 host 和模型名，不需要 key。
  - 查到时，在档位选择器旁边标出：
    - 「据 models.dev：支持 低 / 高 / 最高」。
    - 「据 models.dev：这个模型不能关闭思考」：effort 里没有 `none`、又没有 `toggle`。
    - 「据 models.dev：这个模型按预算控制思考」：只有 `budget_tokens`。这正好对应 ADR-0019 Consequences 第一条，Claude 4.5 及更早的模型。
  - 列表外的档位**照常可选**，只是标灰或标「目录未列出」。
  - 查不到时什么都不标，照常全列。
- **收益：**
  - 大多数选错档的情况，在点「检查」之前就能看到。
  - 数据错了只会让提示出错，不会让请求出错，检查仍然是唯一的判断依据。
- **代价：**
  - 后端在已有的解析函数里多读一个字段，加一个查询接口。
  - 前端在两个设置页的档位选择器旁边加一行提示。
  - 不用新拉数据，不用新的定时任务。
- **数据过时或查不到时会怎样：**
  - models.dev 更新很勤（每天几十到上百次提交，另有每小时同步），但新模型多久能上目录没有统计过。我们的缓存最多晚 24 小时，没价格时 6 小时就会提前刷新。
  - 网关改名（`claude-deepseek-v4.1-flash`、new-api 的自定义别名）、方舟的 `ep-…`、自建 vLLM：查不到，退回到 (a)。**不建议**照 magpie 去补「去 `claude-` 前缀」「按同系列借档位」这类规则：每一条都是兼容表的一行，违背 ADR-0019 的初衷。
  - models.dev 写错时：提示错，检查会纠正。界面文案要写明「据 models.dev」，不要写成「这个模型不支持」。
- **默认档先不显示：**
  - models.dev 没有默认档字段。
  - OpenRouter 的 `default_effort` 至少在 Opus 5.5 上和官方不一致。
  - 只有 DeepSeek 的官方 `/models` 有 `default_level`。
  - 「不设置」的说明继续照 GLOSSARY 写「交给模型自己的默认」。以后要显示默认档，可以只在 `base_url` 就是 openrouter.ai 时引用 OpenRouter 的值、是 api.deepseek.com 时引用 DeepSeek `/models` 的值，也就是只引用「同一家说自己」的数据。
- **ADR-0019：** 不推翻。建议在 Consequences 里补一句，写明边界：「界面可以引用公共目录（models.dev）标出模型支持哪些档位，只作提示：不改发出的参数，不因目录拦保存，查不到就照常全列。」

**(c) 像网关那样在请求时补默认档或夹档**

- **做法：** 按目录或自维护的表，把用户选的档位换成最近的一档，或者在「不设置」时补一个默认档。
- **收益：** 用户永远不会因为档位被拒而失败。
- **代价和风险：**
  - 直接违背 ADR-0019（「我们不按服务地址或模型名去改写参数」）和 GLOSSARY「思考强度」条目（「不会悄悄换成别的档」）。两份都要推翻重写。
  - 数据源一错就悄悄发错参数。例如照 CLIProxyAPI 的注册表，Opus 5.5 的「关闭」会被当成支持而发出 `disabled`，照样 400；照 OpenRouter 补默认档，会给 Opus 5.5 补成 `high`，而官方默认是 `medium`。这正是 ADR-0019 说的「比当场报错更难查」。
  - 夹档方向本身没有标准：magpie 一样近时往高取，CLIProxyAPI 往低取，pi 先往高找（`research.md` 4.6）。对通话槽位来说，往高夹会直接拖慢首字。
  - 查不到的模型（改名、自建）照样只能原样发，所以 (c) 也省不掉检查。
  - 「不设置」时补默认档没有意义：服务本来就会用自己的默认值，补上只会多一个出错点。
- **结论：** 不推荐。

**(d) 其他做法：让检查给出更有用的报错**

- **做法：** 检查失败时，从服务的 400 报错里解析出「支持哪些值」，告诉用户「服务说这个模型只接受 low / high / max」。OpenAI 的原文格式是 "Unsupported value: 'high' is not supported with the '…' model. Supported values are: …"，magpie 就是这样解析的（[effort_accounts.go L92-L141](https://github.com/yetone/magpie/blob/5654c8187cea04544e3b915c8bb444f2d4a873e4/internal/gateway/effort_accounts.go#L92-L141)）。
  - 其他家的报错格式是否也写出支持的值，**未确认**；解析不出来时就原样显示报错。
- **收益：** 不依赖任何目录，改名、自建服务也有效，和 ADR-0019 完全一致。
- **代价：** 检查的报错处理多几行正则。
- **ADR：** 不改。
- **可选的延伸：** 检查时用用户的 key 读一次上游 `/models`。DeepSeek 有 `effort.supported_levels` / `default_level`，Anthropic 有 `capabilities.effort` / `thinking.types.disabled`。这些是「同一家说自己」，比公共目录更准。但要为每一家写解析，又走回了兼容表的方向，建议先不做。

### 4.3 推荐

1. **先照 ADR-0019 把本体做完**，也就是 (a)。顺手做 (d) 的报错解析，代价最小，和 ADR 完全一致。
2. **(b) 收窄版作为后续的一张票**：
   - 只做「支持哪些档位 / 能不能关 / 是不是预算型」三项提示。
   - 数据只用 models.dev，复用 `price_catalog`；查不到就不提示；不显示默认档；不拦保存。
   - 同时给 ADR-0019 补一句边界说明。
3. **不做 (c)。**

---

## 未确认清单

- CLIProxyAPI 的管理界面（单独的 Management Center 仓库）有没有按注册表显示档位：没查。
- CLIProxyAPI 会不会在上游拒绝某一档后记住、换一档重试：没在 `internal/thinking` 里看到，其他目录没有逐一排查。
- CLIProxyAPI 对 `openai-compatibility` 模型把 `max` 夹成 `high`、对 Opus 5.5 / Sonnet 5.5 发 `disabled`：只读了代码，没有实测。
- Anthropic Models API 对 Opus 5.5、Sonnet 5.5、Haiku 5.5 实际返回的 `capabilities.effort` 和 `thinking.types.disabled`：没有 key，没有实测；只看了文档和 SDK 类型。
- OpenAI `/v1/models` 的实际返回：没有 key，只看了 SDK 类型。
- Kimi、GLM、Qwen（DashScope）、豆包（方舟）的 `/models` 有没有能力字段：没查。
- 除 OpenAI 外，其他家在档位不支持时的 400 报错里会不会写出支持的值（决定 (d) 能覆盖多少家）：没查。
- OpenRouter 的 `default_effort`、`mandatory` 和上游官方不一致，是 OpenRouter 有意为之（它这一层有自己的处理）还是数据错误：没查。
- models.dev 的 effort 枚举里 `default` 和 `null` 两个值具体表示什么（今天只有 groq 和 sarvam 的 4 个条目用到）：schema 和 AGENTS.md 都没解释。
