# 06: 拍板：全年龄怎么守

Type: grilling
Status: resolved
Blocked by: 04

## Question

定图时已定：严格只出全年龄内容，写死不做开关，越界的要求她以自己的口吻拒绝。要定的是怎么做到：

- 第一道：她拒绝（扮演角色的 LLM 按人设拒绝越界要求），还是判断模型先拦？
- 第二道：提示词层面固定的负面词（nsfw 等）、只从白名单里拼服装和动作，还是对情境做关键词过滤？用户的原话会不会直接进提示词？
- 第三道：生成后要不要检查图片（NovelAI 有没有返回安全标记、要不要再调一个图像审核）？检查不过时怎么办。
- 「NovelAI 官方图像 API 现状」：官方服务端不过滤，建议 V5 Curated、正面 `rating:general`、负面 `nsfw` 加官方预设；「NovelAI 中转的常见协议」：中转常静默忽略负面词等参数——负面词不能当唯一一道。模型要不要锁死成 Curated，自带的用户能不能换。
- 未成年偶像有没有额外的限制（服装、镜头）。
- 自带 key 的用户是否同样受这些约束（是，写死）——具体在哪一层生效，用户改不了。

结论记一条 ADR（照片只出全年龄内容）。

## Comments

- 「拍板：怎么触发、谁来写提示词」已定：她写的只有三栏英文 tag（地点和时间、服装、动作和表情，合计不超过 12 个），拍法和景别是枚举；用户的原话不进提示词；服务器会剥掉语法字符、做清洗，查本地 tag 表。全年龄的黑名单按栏收紧就挂在这一步上。冷淡这一档写死不发。判断模型只认「是不是在要照片」，不判越不越界。
- 「调研：NovelAI 提示词写法」（`research/novelai-prompting` 分支）实测：即使加了 `rating:general` 和负面 `nsfw`，8 张里仍有 2 张白衬衫领口露出粉色吊带。负面词要补 `bra strap` 这类细项。

## Answer

2026-10-17 拷问定下（grilling + domain-modeling），记成 ADR-0023「照片只出全年龄内容，不查生成后的图」。`GLOSSARY.md`「照片」里本来就写着只有全年龄的内容，越界的要求她以自己的口吻拒绝，没有改。

**守的三道，都在服务器上，写死不做开关**

1. **她推掉。** 判断模型不判越不越界，第一道只靠她。照片说明里写明哪些不拍（就是下面「挡掉」那几类）。用户指定的地点、服装越界时，她可以推掉，也可以换成全年龄的版本再拍（比如要内衣照，她换成睡衣）。
2. **服务器的黑名单。** 清洗她写的三栏时，撞上黑名单的 tag 只剥掉那一个，剩下的照常生成；某栏剥空了就补默认值（服装栏补 `casual`）。照片照发，不按失败处理。每次剥掉都写进运行记录，用来看她多常撞线、照片说明要不要收紧。
3. **写死的提示词和模型。** 正面末尾是 `rating:general`（放在质量 tag 前面）。负面依次是 `nsfw`、Human Focus 预设、`nude, nipples, underwear, bra, panties, bra strap, strap slip, see-through, pantyshot, cleavage`。`cleavage` 留着，穿泳装时也能把镜头从胸口拉开。模型锁死成 V5 Curated。

**生成后不查图。** NovelAI 不返回安全标记。外部审核接口要部署者另有 key，而且对动漫图不准；本地分级模型（WD tagger）要多加一个依赖，每张还多等约一秒。我们接受残余风险：中转悄悄忽略负面词时没有兜底，偶尔漏出吊带这类擦边的细节也会照发。以后要补，就加回本地分级模型那一档。

**那条线：所有人一条线**

不按年龄分，角色配置不加年龄字段，果穂（12 岁）和成年的偶像用同一套规则。

- **放行**：泳装（`swimsuit`、`one-piece swimsuit`、`bikini` 等常见的）、睡衣、`lying`、`on bed`、`sleeping`、泳池、海边。「果穂穿比基尼躺在床上自拍」能拍。
- **挡掉**（服务器黑名单，她的照片说明里也写明）：
  - 裸露和半裸：`nude`、`topless`、`bottomless`、`naked towel`、`censored` 之类
  - 内衣和情趣服装：`underwear`、`bra`、`panties`、`lingerie`、`micro bikini`、`sling bikini`、`slingshot swimsuit`、`school swimsuit`（Danbooru 上偏性化）
  - 透视和走光：`see-through`、`wet clothes`、`pantyshot`、`downblouse`、`wardrobe malfunction`
  - 洗澡场景：`bath`、`bathing`、`shower`、`onsen`
  - 性化的镜头和姿势：`ass focus`、`breast focus`、`pov breasts`、`from below`、`spread legs`、`on all fours`、`bent over`、`presenting`
  - 性化的表情：`ahegao`、`seductive smile`、`naughty face`、`heavy breathing`
- 上面列的是各类的代表。写规格时用官方 tag 建议接口（V5 Curated）把同义和相近的 tag 补全，负面细项也在那时逐个核对是已知 tag。

**自带生图同样受约束**

自带的 key 只存在浏览器里，但生图请求只能由服务器发，前端从不直接调生图服务。所以黑名单、写死的负面词、`rating:general` 和锁死的模型对自带的用户一样生效。部署者和用户都不能改模型、负面词和黑名单，后台不出这几项配置。

后续（2026-10-17）：「拍板：后台配置和自带密钥」把模型改成部署者和自带的用户都能换，默认 V5 Curated，上面「锁死」「不能改模型」两处以那张票为准，ADR-0023 已改。
