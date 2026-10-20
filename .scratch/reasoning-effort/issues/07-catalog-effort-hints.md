# 07: 档位旁边标出目录里写的支持情况

**What to build:** 部署者在后台、用户在设置页选思考强度时，如果 models.dev 里查得到这个模型，就在档位旁边标出「目录里写着不支持」，并提示能不能关闭。只作提示：不隐藏、不禁用、不拦保存，也不改变发出去的参数；查不到就照常列出全部档位。背景见 `../spec.md`「档位提示」和 ADR-0019。

**Blocked by:** 04、05（后台和设置页的档位表单都在这两张票里）

**Status:** done

**难度：中。** 抓目录和按地址、模型名匹配的逻辑现成（价格目录），要加的是解析推理选项、存下来、一个查询接口、两处表单的标注。整张票随时可以砍掉，不影响前面几张。

## 已定的设计（详见 spec）

- 价格目录从 models.dev 抓数据时，一并解析每个模型的推理选项：支持哪些档、能否关闭。字段以 `../research-auto-effort.md` 查到的为准；models.dev 里含义不明的值（如 `default`、`null`）不用。
- 查询接口：给出协议、地址和模型名，返回查到的档位信息，查不到返回空。部署者和登录用户都能用，不需要密钥。
- 不显示默认档位（各目录说法不一）。不用 OpenRouter、各家 `/models` 接口的能力数据。

## 验收

- [x] 目录测试：从录好的 models.dev 数据里解析出推理选项；匹配沿用价格目录的测试写法。
- [x] 接口测试：查得到返回档位信息；查不到返回空；未登录拒绝。
- [x] 前端纯函数测试：有提示时给对应档位加标注，没有提示时和现在一样；标注不影响改动校验和保存。
- [x] 实测：本地构建版上，后台选一个 models.dev 里有的模型（如 DeepSeek 或 Gemini），看到标注；换成目录里没有的名字，标注消失、档位照常可选。
- [x] `backend/` 下 `pytest`、`frontend/` 下 `npm test` 全部通过，`ruff`、`pyright`、`tsc` 没有新的报错。

## Comments

- 票 05 留下的：后台和设置页的档位下拉框是同一个 `components/app/ReasoningEffortFields.tsx` 的 `EffortField`（档位名用 `lib/reasoningEffort.ts` 的 `effortLabel`、`effortChoices`），标注加在它上面两处就都有了。另外：Base UI 的 Select 在列表里没有当前值时会把值清掉，所以选着「极低」换成 Anthropic 时，表单里的强度变回「不设置」，不会显示「换一档」的提示（票 03 起就这样，后台和设置页一样）；标注只加文字、不删选项，碰不到这个。设置页查档位信息时，协议、地址、模型名取表单里正在填的值。
- 票 07 做完：models.dev 每个条目（不论有没有价格）的推理选项存在新表 `price_catalog_thinking`，查询接口是 `GET /api/account/keys/llm/efforts?protocol=&base_url=&model=`，地址按计价同样的 `activity.host` 取。协议用来解释 `toggle`：Anthropic 协议的「关闭」发的就是 `thinking:disabled`，算能关；其他协议的「关闭」发 `none`，只有 `toggle` 时说成「用它自己的开关关闭，可以改用额外请求参数」，「关闭」那档也标「models.dev 未列出」。只按预算思考的模型（Claude 4.5、Gemini 2.5 Pro）和空数组一样说「不按档位调节」，没单独提示「按预算」。查不到时顺带 `refresh_soon(missing=True)`（最多 6 小时一次），这样升级上线后不用等满 24 小时才有提示。新表是 `CREATE TABLE IF NOT EXISTS`，不改旧表，但上线前仍照 VPS 惯例手动备份线上库。
