---
status: accepted
---

# 思考强度只按协议原样传，不维护各家模型的兼容表

思考强度的档位（none、minimal、low、medium、high、xhigh、max）按协议换成固定的写法后原样发出：chat-completions 发 `reasoning_effort`，Responses 发 `reasoning.effort`，Anthropic 发 adaptive 思考加 `output_config.effort`，关闭发 `thinking:{type:"disabled"}`。我们不按服务地址或模型名去改写参数。各家对档位的支持差别很大，比如 Claude Opus 5.5 关不掉思考，GPT-6 Astra 不认 `none`，Kimi K3 没有 `medium`，Qwen 和 GLM 的旧模型要用自己的私有字段。这些差别交给保存时的检查去暴露：服务不认这一档，检查当场报错，由部署者或用户换一档，或者改用额外请求参数 JSON 自己写。我们只是调用模型的一方，模型更新得太快，一张兼容表跟不上，维护它的成本比偶尔让人换一档高得多。调研见 `.scratch/reasoning-effort/research.md`。

## Considered Options

- **照 pi、LiteLLM 那样维护兼容表**：按 `base_url` 和模型名判断该发什么，自动把「关闭」换成各家能接受的写法。用的人省事，但每出一个新模型都要改表，表一旦过时就会悄悄发错参数，比当场报错更难查。
- **把档位换算成统一的思考预算**：各网关给同一档换算出的预算从 4096 到 24576 不等，没有公认的标准，而且 Claude 4.7 以后的模型根本不接受预算写法。

## Consequences

- Claude 4.5 及更早的模型只认预算写法，选了强度会在检查时报错。用这些模型的部署者只能选「不设置」，或者自己在额外请求参数 JSON 里写 `thinking`。
- Anthropic 协议没有 minimal 这一档，界面上不提供。
- 保存时的检查必须真的带上每一档强度把工具调用完整走一遍，否则「不支持」要等到用户的回合失败才会暴露。
- 界面可以引用公共目录（models.dev）提示某个模型支持哪些档位，但只作提示：不隐藏、不拦保存，也不改变发出去的参数。网关 magpie 和 CLIProxyAPI 会在请求时把档位换成模型支持的最近一档，我们不这样做，因为各目录都有和官方文档不符的条目，自动换档会把错误悄悄发出去（`.scratch/reasoning-effort/research-auto-effort.md`）。
