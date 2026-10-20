# 02: 判断阈值的覆盖按 family 绑定

**What to build:** 后台设的判断阈值（回忆、情绪）改为跟着判断模型的 family 走，和预设阈值的查法（`judge_family`）一致：同一 family 内换写法、换版本，覆盖继续生效；换到别的 family 才失效。后台换判断模型时，也只在换到别的 family 时清掉阈值覆盖。没校准过的判断模型，只在它生效时提醒一次。背景见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-07 grilling，详见 spec）

- `FOR_MODEL` 照旧存原始模型名，后台「为 X 设的」照旧显示原名；数据库里已有的覆盖不用迁移。
- **绑定**（`_bound_holds`，只针对判断阈值）：两边都有 family 时按 family 比；任一边没有 family 时按原始名比。重排阈值的绑定不变。
- **清掉**（`_changed`）：后台保存或恢复判断模型后，绑定不再成立时才清掉判断阈值覆盖。也就是换到别的 family，或者没有 family 的模型换了名字。
- **warning**：没校准过的判断模型（`judge_family` 为 None），在它生效时提醒一次：启动时，以及后台保存、恢复判断模型时。读阈值（`judge_thresholds`）时不再提醒。
- **文档**：`docs/deploy.md:382` 改为：判断阈值的覆盖是针对判断模型的 family 设的，后台或 `.env` 换到别的 family 时才失效（后台换的清掉，`.env` 换的保留但标为失效）；重排阈值照旧针对模型。

## 验收

- [x] **按 TDD**：先写下面的用例，看到它们失败，再改实现。
- [x] `.env` 的判断模型从 `typesafe/jev-1.13` 改成 `jev-1.13`（或 `jev-1.14`）后重启：后台设的判断阈值仍为 `overridden`，检索和情绪判断用的是覆盖的阈值。
- [x] `.env` 的判断模型换到别的 family（jev → clef）：覆盖标为 `failed`，说明是为哪个模型设的；判断用 clef 的预设阈值。
- [x] 后台把判断模型换成同一 family 的另一个版本：阈值覆盖保留并生效；换到别的 family：阈值覆盖被清掉。
- [x] 没有 family 的模型：名字一变覆盖就失效（后台换就清掉），和以前一样。
- [x] 没校准过的模型：启动时 warning 一次；跑几个回合，warning 不增加；后台换成另一个没校准过的模型，再 warning 一次。
- [x] `docs/deploy.md` 已改。
- [x] `backend/` 下 `pytest` 全部通过，`ruff` 和 `pyright` 没有新的报错。
- [x] **人工验收（留给用户）**：本地起服务，在后台设一个判断阈值；把判断模型换成同一 family 的写法（`.env` 或后台），确认阈值仍生效；换到另一家，确认后台标为失效或已清掉、说明写得清楚；看日志，没校准过的模型不再每个回合打 warning。

## Comments

### 2026-10-08 实现说明

- `judge.same_judge_family(set_for, model)` 定绑定规则；`judge.warn_if_uncalibrated(model)` 取代 `judge_thresholds_for` 里的 warning（`eidolon eval judge` 也改为显式调它）。
- 生效时提醒：`LiveConfig` 构造时、后台保存或恢复判断模型且模型名变了时、启动时判断模型的覆盖试不通退回 `.env` 时。
- 原来的 `test_the_recall_threshold_saved_judges_the_next_turn_until_the_model_changes` 改为「直到换 family」：换到 `typesafe/jev-1.14` 覆盖保留，换到 clef-flash 才清掉——这是本 ticket 要改的行为。
