# 11: 原型：画风

Type: prototype
Status: resolved
Blocked by: 05

## Question

照片用什么画风。画风由服务器写死，她写的标签里不能出现画风或画师 tag（见「拍板：怎么触发、谁来写提示词」）。在「原型：外貌一致性」选定的外貌做法和模型上，对比几种画风：

- 不加任何画风 tag 的默认画风，作为对照；
- 画师 tag：重点比这一项，看选哪几位、单个还是几个组合、各自配多大权重；
- 往原作卡面的感觉靠（例如 `official art` 这类 tag）；
- 往手机照片的真实感靠（半写实、手机照片的质感）。

每种画风都要看换了以后还像不像她（画师 tag 会改变脸型），以及自拍、别人帮她拍、室内、外景各是什么样。还要回答：用真人画师的名字作画风，和 ADR-0003 对粉丝衍生图的立场有没有冲突，要不要修订那条 ADR。结论决定服务器拼进提示词的画风部分写什么，以及同一部署里所有角色是不是共用一种画风。

生成的图不进仓库，也不进存储桶；对比页放在 `prototype/photos-art-style` 分支，图片放在仓库外的目录。只出全年龄的图。

## Comments

- 「调研：NovelAI 提示词写法」（`research/novelai-prompting` 分支的 `.scratch/photos/research/novelai-prompting.md`）建议不用 `photo (medium)`、`photo background`，因为它们会把画风拉向实拍或拼贴；对比真实感时注意这一点。
- 「原型：外貌一致性」已定：模型用 V5 Curated，前缀是角色 tag 加外貌 tag（发色、发型、瞳色），五位的外貌 tag 写在那张票的 Answer 里。生成脚本可以照着改：`prototype/photos-appearance` 分支的 `.scratch/photos/prototype/appearance/gen.py`，同一个种子能和那次的图对照。**每张都扣用户中转的额度，开跑前先跟用户说要出几张、等他点头**；那次计划 100 张，用户嫌多，叫停在第 34 张。

## Answer

2026-10-17 用户看对比页定下。原型在 `prototype/photos-art-style` 分支（提交 `b735ce9`）的 `.scratch/photos/prototype/art-style/`：生成脚本、对比页生成器，以及实际生成的 24 张的提示词记录。图和对比页在仓库外的 `E:/tmp/nai-art-style/`（`index.html`）。

**比了什么**：模型 V5 Curated，提示词、种子、参数和「原型：外貌一致性」的「角色 tag + 外貌 tag」一字不差，只在作品 tag 后面插一段画风；不加画风的对照图直接用那次的图。画师候选是用户在 [nax.moe](https://nax.moe/) 和 [tags.gallery](https://tags.gallery/) 上挑的六位：ningen mame、starshadowmagician、machi (machi0910)、deyui、rella、toosaka asagi。分三档出图，每档先报张数：

1. 六位单个、不加权重 × 真乃 × 自拍·咖啡店、别人拍·外景·全身，12 张。
2. 用户挑的 ningen mame、starshadowmagician、rella × はるき（最冷门）× 同样两个情境，6 张；rella 另补「别人拍·事务所」，真乃和はるき各 1 张。
3. rella 的权重和组合 × 真乃 × 自拍，4 张：`1.3::artist:rella::`、`0.7::artist:rella::`、rella 加 `0.6::` 的 ningen mame、rella 加 `0.6::` 的 starshadowmagician。

`official art` 和偏手机照片的真实感两档没比：用户看完第一档已经有了方向。

**结论**

- **画风是部署者在后台填的一段文字，仓库里默认是空的（不加画风）。** 用户自己的部署填 `0.7::artist:rella::`。服务器把它原样插在作品 tag 后面、外貌 tag 前面；她写的栏碰不到这一段，清洗她那几栏的规则（剥 `:` 等语法字符）不管这一段，所以可以写数值加权和多位画师。
  - 后台「生图」标签页的生图卡上加一项「画风」，自由文本，可以留空；环境变量 `NOVELAI_STYLE`，默认空。保存时生成的那张检查图也带上画风。
  - 一个部署只有一种画风，所有角色共用，也对用自带生图 key 的照片生效；自带的那一侧不出画风这一项。
- **为什么不写死在代码里**：仓库是公开的，写死就等于在公开仓库里写明模仿某位在世画师的画风。ADR-0003 管的是原作版权方、接受的是我们生成的粉丝衍生图，画师名字牵涉的是画师本人，是另一类风险。放进后台配置后，仓库里不出现画师名，ADR-0003 不用改；填了画师名的后果由填的人承担，和 ADR-0023 换模型的口径一致。不另记 ADR。
- **为什么选 `0.7::artist:rella::`**：用户最喜欢 rella 暖色、有照片感的光影；第三档里 0.7 这张最好看。

**看到的**

- 六个画师 tag 在 **V5 Curated** 上都有效，每列画风都和对照组明显不同，不用为了画风换 Full。nax.moe 和 tags.gallery 的图都是 V5 Full 出的，Curated 上效果也一样明显。
- **画风没有把脸带走**：はるき在三位画师下都是粉棕短发、黑蝴蝶结、黄眼睛，一眼认得出来。只有 toosaka asagi 把真乃自拍的瞳色带偏成蓝色、发色变浅。
- **白边**：starshadowmagician 四张里三张自带一圈白边，rella 偶尔也有（真乃自拍那张）。用户觉得像拍立得、挺好看，不在负面词里压。
- **权重影响不大**：0.7、1.0、1.3 构图和脸几乎一样，主要差在明暗（1.3 最暗、对比最强）；0.7 并不更接近原作。组合（副画师 0.6）变化更明显：加 ningen mame 更亮更可爱，加 starshadowmagician 更淡、有手绘感。
- rella 会改衣服细节（`white shirt` 画成荷叶边衬衫、真乃那张裙子变长），也更爱拍「人在风景里」，外景的人偏小。用户觉得可以接受。
- `0.7::artist:rella::` 只在真乃自拍上出过一张；はるき、外景、事务所都是不加权重的 rella。权重影响小，不再补图。
- 官方 tag 建议接口不列在世画师：输入 `artist:` 开头只推荐古典画家，连 nax.moe 上有效的 `wlop` 也不推荐。画师 tag 认不认识只能出图看，后台的画风项保存时那张检查图就是唯一的验证。
