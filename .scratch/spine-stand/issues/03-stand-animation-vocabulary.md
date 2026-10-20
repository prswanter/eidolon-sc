# 03: 调研：stand 动画词表的覆盖情况

Type: research
Status: resolved
Blocked by: none

## Question

在本地素材（`shinycolors-spine/assets/spine/idols/{stand,stand_costume}`）里：动画名可以归成哪几类（body 动作、face、lip、eye、arm、其他）；候选情绪（开心、害羞、惊讶、难过、生气、思考、平静，以及素材暗示的其他情绪如 fear、jito、tear）各有哪些动画、在各套衣装里的覆盖率；`lip_*` 口型的命名规律（`_s` 是什么、`lip_a` 是什么）；哪些动画是循环的、哪些只播一次、时长多少（从 json 的 timeline 读）；每类动画影响哪些骨骼/插槽，能否安全叠加；衣装缺某个动画时有什么可替代的。顺带对照已有粉丝项目给动画名的归类。

## Research

调研在分支 `research/stand-animation-vocabulary` 上进行，结论写在 [`research/stand-animation-vocabulary.md`](../research/stand-animation-vocabulary.md)（2026-10-01 从该分支挪进 main，分支已删除）。

## Answer

详细结论和可复现的脚本见 [`research/stand-animation-vocabulary.md`](../research/stand-animation-vocabulary.md)，下面是摘要：

- **分类**：2215 套衣装里一共有 317 个不同的动画名：身体 71、表情 65、口型 69、手臂 40（只用作放下手臂的过渡）、视线 8、点头摇头 4、脸红和眼泪叠加 3、道具出现和消失 33、skill 7、`blank`，另有 16 个调试残留。每套衣装都有的只有 11 个。
- **候选情绪**（百分比依次是全部衣装 / 真乃 / 恋钟的覆盖率）：
  - 平静：`wait`、`face_wait` 都是 100%；
  - 开心：`smile1` 100%，`face_smile` 80/100/100；
  - 害羞：`shy1` 88/99/100，`face_shy` 97；
  - 惊讶：`surp1` 100%，`face_surp` 79/100/1；
  - 难过：`sad1` 100%，`face_sad` 98%，`face_cry` 可以当作更重的难过；
  - 生气：`anger1` 100%，`face_anger` 77/100/100；
  - 思考：`think` 59/100/100，`face_serious` 93/0/99。
  - fear、jito、trouble 只有 4–12% 的衣装有，两位已配置角色都是 0%，不放进词表。两位角色用的命名体系不一样，所以每个位置都要按衣装逐级找替代。
- **口型**：`lip_<情绪>` 是约 1.57 秒一次的张合循环，说话时用；`_s` 是不说话时的静态嘴型（时长为 0，77–100% 和说话循环的第 0 帧一致）；`lip_a` 是张嘴后保持 10 秒的「あ」，不循环，真乃没有 `lip_a`。
- **循环和单次**：94% 的身体动作带 `loop_start`，开头播一次，之后循环后半段（中位时长 9 秒，循环点约在 3.3 秒）；`wait` 整段循环；`face_*` 要么是带眨眼的约 3.33 秒循环，要么是静态；`eye_*` 和 `_s` 是静态；`yes`/`no` 只播一次（1.3–2.3 秒）；`arm_*` 过渡约 0.7 秒。
- **叠加**：照游戏的轨道布局叠加是安全的：0 身体、1 表情、2 点头、3 视线、4 脸红、5 口型。表情和口型在 1530 套里从不共用骨骼或插槽；视线和表情有 96% 共用眼部骨骼，所以视线轨道必须在表情轨道上面；`yes` 结束时不在中立姿势，播完要清掉这条轨道。
- **缺动画时的替代**：几乎所有缺失的动画，在受影响的衣装里 100% 都能找到替代；缺表情时用 `blank`，把脸交还给身体动作自带的表情。唯一比较弱的是 `face_shy`。
