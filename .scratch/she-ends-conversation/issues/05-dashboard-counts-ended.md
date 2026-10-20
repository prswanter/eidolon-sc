# 05: 看板统计她结束对话的次数

**What to build:** 看板「好感度」一节按角色、按原因（冷却、不该说的话、接连不快）显示她结束对话的次数，和通话的「她挂断了」放在一起对照。见 `../spec.md`「看板」。

**Blocked by:** 02

**Status:** done

- [x] 从回合的运行记录里按角色、按原因统计结束对话的次数，和看板其他数字用同一个时间范围
- [x] 看板「好感度」一节显示出来，不落到任何一位用户
- [x] 文案进 `zh.ts`；按 `frontend/AGENTS.md` 的 shadcn 纪律

### 测试

- [x] 后端：三种原因各自计数，通话的挂断不算进来
- [x] 本地构建版 Playwright 看一眼看板
- [x] 后端完整测试、前端类型检查和测试通过

## Comments

- 2026-10-15 票 01 留下的：原因已记在 `activity_records.ended_conversation`（`EndsFor` 字符串，只有文字回合有），`ActivityLog.since` 读出的 `RecordRow.ended_conversation`，看板直接按它和 `character_id` 计数。