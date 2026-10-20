# 03: 文档：README 说明补充与打断

**What to build:** 在三份 README（`README.md`、`README.en.md`、`README.ja.md`）的「语音通话」一节补上通话中的轮流规则，并把 mvp/04 里记着的已知限制标为已解决。

**Blocked by:** 01、02

**Status:** resolved

- [x] 三份 README 的「语音通话」列表各加一条，大意如下：
  - 角色开口前你接着说的话（说或打都算）会并进同一句，角色放下刚才的回复，重新回答；
  - 角色说话时你开口会打断她，她停下来，这条回复只记下已经说完整的部分；
  - 打字不会打断角色。
  - 措辞和另外几条保持一致，不用术语以外的叫法（以 `CONTEXT.md` 为准）。
- [x] `.scratch/mvp/issues/04-voice-call.md` 的 `## Comments` 末尾追加一条，说明第 35 行的已知限制已由 `.scratch/call-turn-taking/` 解决。原文不改。
- [x] 如果 01、02 实现时新增了常量（例如补充定稿为空时的兜底超时），不用写进 README，除非它是可以配置的环境变量。可配置的还要同步 `.env.example`。

## Comments

2026-09-27 完成：三份 README 的「语音通话」列表在打字那条之后各加一条，按 `CONTEXT.md` 的补充、打断、回合来写。`.scratch/mvp/issues/04-voice-call.md` 的 Comments 末尾追加了说明。01、02 只新增了代码里的常量 `FOLLOW_ON_TIMEOUT`，不是环境变量，所以没写进 README，`.env.example` 也不用改。
