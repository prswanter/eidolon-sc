# 02: 通话带上第几次拨号和打了多久，快照交出上一句

**What to build:** 通话层上这三样照旧：
- 因故结束的通话在结束页上显示「通话已结束 · mm:ss」，没接通过的只显示「通话已结束」；
- 只看文字时，台词卡上以浅色留着她在这通电话里的上一句，一句话变长时还是当前这句，重拨后清空；
- 每次拨号立绘重新载入。

现在这三样由通话层里三个 hook 在渲染时各自推算，没有测试：
- 时长：记下接通时刻，结束时用 `Date.now()` 算；
- 上一句：新原文以旧原文开头才算同一句；
- 第几次拨号：数进入拨号的次数。

改成由 LiveConversation 交出。唯一看得出的变化是：补充时被放下的那次回复，不再作为上一句出现，和 GLOSSARY「放下的那次回复不留任何痕迹」一致。

背景见 `../spec.md`（「通话状态与快照」）。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 已定的设计（2026-10-11 grilling，详见 spec）

- 通话状态的拨号、接通、因故结束都带 `dial: number`：这一页第几次拨号，从 1 开始，每次 `startCall` 加一，三个阶段沿用同一个值。页面拿它当立绘的 key。
- 因故结束带 `seconds: number | null`：在判定结束的那一刻用 `ports.now` 算出接通以来的整秒数（向下取整，不小于 0），没接通过为 null。用户自己挂断时直接回到 idle，用不到时长。
- 快照加 `previousLine: Segment | null`：取的范围和 `line` 一样，是这通电话的记录，取倒数第二句有原文的话。不论开没开只看文字都交出。
- 删掉 `useDialCount`、`useEndedSeconds`、`usePreviousLine`；通话层直接读这三个字段。

## 验收

- [ ] `liveConversation.test.ts`：
  - `dial`：第一次拨号是 1，重拨加一，接通和结束沿用同一个值。
  - `seconds`：用停住的时钟，接通后过 83 秒断线，结束状态带 83；没接通就失败时为 null。
  - `previousLine`：
    - 她换了一句，原来那句成为上一句；
    - 同一句变长，上一句不变；
    - 补充时被放下的回复，不会成为上一句；
    - 重拨后从 null 开始；
    - 上一通电话的话不算。
- [ ] 三个 hook 删掉，通话层里不再有为推算这三样而在渲染时 setState 的代码。
- [ ] `vitest`、`tsc`、`sh scripts/check-discipline.sh` 通过。
- [ ] 人工验收清单写进 Comments：在构建版前端里核对：
  - 接通后等一会儿，让通话因故结束（例如停掉后端，或者等到时间用完），结束页显示时长；
  - 没接通就失败的通话，结束页不带时长；
  - 只看文字时，上一句以浅色留在当前这句的上面，同一句变长时不跳；
  - 重拨后台词卡没有上一通的话，立绘重新载入。

## Comments

### 实现说明（2026-10-11）

- `CallState` 改成 spec 的形状：`dialing`、`connected`、`ended` 都带 `dial`；`ended` 另带 `seconds: number | null`。`dial` 存在 `State` 里（不从 `callFrom` 推），`startCall` 时加一，三个阶段沿用同一个值。
- `seconds` 在 `ended()` 判定结束的那一刻，用注入的 `ports.now` 从 `connected.since` 算到现在的整秒数（向下取整、不小于 0）；没接通过的为 null。用户自己挂断走 `ended(null)` 回 idle，不算时长。
- `Snapshot` 加 `previousLine`：与 `line` 同范围（这通电话的记录 `entries.slice(callFrom)`），取倒数第二句有原文（ja 非空）的话。`line` 和 `previousLine` 现在都由一个 `callLines` 摊平后取最后两句（原来的 `latestLine` 删掉）。补充时被放下的回复已经不在记录里，所以不会成为上一句。无论只看文字开没开都交出。
- `CallLayer.tsx` 删掉 `useDialCount`、`useEndedSeconds`、`usePreviousLine`，改读 `call.dial`、`call.seconds` 和新增的 `previousLine` prop（页面从快照传入）。`ShownCall` 类型没搬（票 03 的事）。

### 人工验收清单（构建版前端：在 `frontend/` 下 `npm run build` 然后 `npm run start`）

1. 进一位角色的对话页，点电话键：立绘载入；挂断后重拨，立绘重新载入（每拨一次都重载）。
2. 接通后等一会儿让通话因故结束（停掉后端，或等到通话时长上限）：结束页状态行显示「通话已结束 · mm:ss」，时长从接通算起。
3. 让一次通话没接通就结束（例如后端/语音服务不可用）：结束页只显示「通话已结束」，不带时长。
4. 打开「只看文字」。她说完第一句换第二句时，第一句以浅色留在当前这句上面；当前这句在说的过程中变长时，上面那句不动、不跳。
5. 同一通里在她还没说完一段时补充一句：被放下的那句不会留在「上一句」位置。
6. 重拨：新一通电话的台词卡上没有上一通的话。
