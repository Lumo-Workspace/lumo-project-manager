# 把 Lumo 记忆改成经人审核的 judgment

日期:2026-11-18 · 任务:LUM-1354 · 状态:所有者已裁定(LUM-1354 Decision 2–11,2026-11-19)

现状断言核实于 `origin/main` @ `2614582ac`(PR 1743 合并之后)。proofpress 的断言核实于
`continuara-lab/proofpress-judgment` @ `2623c8f`(Apache-2.0)和本机 CLI 输出的 schema。
本文可以写 proofpress 的名字;对客文案、PR 标题和正文不写。

## 1. 为什么做

所有者 2026-11-18 的裁定(LUM-1354 Decision 1):PR 1743 之后,Lumo 记忆要变成像 proofpress 那样的
judgment,流程跟随它,并做成团队层。他没有说明理由,本文不替他补。这会取代 LUM-535 的路线。

今天的记忆有三个和这个方向直接冲突的事实:

- **没有审核这一步。** `MemoryStatus` 只有 ACTIVE / SUPERSEDED / ARCHIVED / INVALIDATED
  (`prisma/schema.prisma:3533`),`status` 默认 ACTIVE(`:3557`),`memoryRepository.create` 不设状态。
  所有写入路径产生的行立刻生效并被投递。
- **写入主要是模型自动做的。** 每个 Stop 回合跑 Layer1(`lib/services/stop-turn.service.ts:72`),
  任务 DONE 跑 Layer2(`lib/services/task-state.service.ts:406`),里程碑复盘后跑提炼
  (`lib/services/milestone-summary.service.ts:81`)。Layer1 的 ADD 可以按模型给的 scope 直接写出
  项目级记忆(`lib/services/memory/layer1-apply.ts:212`),还能硬删除已有记忆(`:129`)。
- **来源标注不可靠。** 「user-authored / agent-authored」只看 `createdByMemberId` 是否为空
  (`lib/memory/render.ts:199`)。agent 用成员的 CLI key 写入时会带上 `identity.memberId`
  (`app/api/projects/[id]/memories/route.ts:45`),于是 agent 写的内容被标成人写的。

现有的「审核」都发生在生效之后:下一个会话里给 agent 看一次的 Review needed 段
(`lib/memory/render.ts:218`)、DONE 时模型判定失效(`lib/services/memory/curation.service.ts:91`)、
人在 Web 上确认的退役与合并(只能移除,不能准入)。

## 2. 目标与非目标

**目标**

- 团队记忆的每一条都是一个 judgment:说了什么、为什么、什么时候适用、谁判断的、谁记录的、依据是什么。
- 只有人批准过的那个确切修订才会被投递给 agent;agent 只能提候选和提修订。
- 可以修订和撤回,全程留痕。
- 分阶段上线,每一阶段可单独发布、可单独回滚;切换到「只投递已批准的」由每个工作区自己决定时间。

**非目标**

- 不引入 proofpress 的代码,不依赖它的版本。只参考字段设计和流程,不复制它的 JSON Schema 文件,
  所以不涉及 Apache-2.0 的许可声明。
- 不做「绑定到工具调用的拦截」。proofpress 自己的设计讨论把它列为未实现的后续方向,并且要求走
  完整登记的动作索引而不是检索。Lumo 的越界检测器、策略规则、安全扫描本 RFC 不动。
  唯一的接触点保持现状:写入时用项目策略规则做冲突检查(`lib/services/memory/write-gate.ts`)。

**做到了也算失败**

- 某个工作区在没有准备的情况下被切换,agent 第二天拿不到任何团队记忆。
- 审核队列没人看,团队记忆从此不再增长,却没有任何指标提示。
- agent 能通过任何路径让自己提的内容生效。

## 3. 所有者的裁定

所有者 2026-11-19 的裁定共十条。原先列出的 8 个问题按推荐(「8 个问题都按推荐来」);随后两句话改了其中
一条并新增两条:「只有批准过的修订会被取用，断言冲突会同时暂停准入和复用,直到解决」和「停止注入」。第二句取代了问题 5 原先的推荐
(遗留记忆标「未审核」继续投递)和第 5 节原先的冲突处理(已生效的继续投递)。

| #   | 问题              | 裁定                                                                                                                      | 记录        |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | 检索与投递        | 准入、修订、撤回跟随;投递保留「同步到本地 + 常驻索引」,只投递已批准的;适用条件用来过滤和排序,另加一个按条件精确查询的命令 | Decision 2  |
| 2   | 谁能批准          | 工作区里任何人类成员,只能在 Web 上操作;agent(CLI key)一律不行;工作区可以收紧为仅 OWNER                                    | Decision 3  |
| 3   | 自动抽取          | 保留,但只产生候选;Layer1 不再写项目级记忆、不再删除已有记忆。自动来源见 6.3                                               | Decision 4  |
| 4   | 分类怎么对应 kind | 不做一一对应:给出默认映射,由审核人最终选定;自动抽取的候选默认是 `hypothesis`                                              | Decision 5  |
| 5   | 存量记忆          | 只有批准过的修订会被取用。遗留记忆不再投递,只作为「转成候选」的材料                                                       | Decision 6  |
| 6   | 缺理由能不能批准  | 不能。来源未知或理由为空的修订,审核人要先补一版                                                                           | Decision 7  |
| 7   | 对客名称          | 产品里仍叫团队记忆(Team memory),条目状态显示「待审 / 已批准 / 已撤回」;内部模型叫 Judgment                                | Decision 8  |
| 8   | 上线范围          | 先只在 Lumo 自己的工作区打开,量出第 8 节的指标后再决定是否对客户默认开启                                                  | Decision 9  |
| 9   | 断言冲突          | 同时暂停准入和复用,直到解决                                                                                               | Decision 10 |
| 10  | 任务级工作笔记    | 停止注入;Layer1 的记忆抽取下线                                                                                            | Decision 11 |

没有被选中的做法:问题 1 的「检索也完全跟随,停掉同步」;问题 2 的「仅 OWNER 能批准」「必须由提出者以外的人
批准」「允许在 CLI 上走确认握手来批准」;问题 3 的「整体下线,只留显式提交」;问题 4 的「保留四个分类,
kind 只作附加标签」;问题 6 的「允许勾选理由未知仍批准」;问题 7 的「对客也改叫 judgment」;问题 8 的
「一次对所有工作区开启」;问题 10 的「保留任务级笔记,只在同一任务内注入」。

### 问题 1 的依据

任务描述要求先核实 LUM-535 / LUM-536 的原始记录,再给建议。核实结果:

- LUM-535 评论 `#cmqgtzzg`(2026-06-16)原文写的是「pull≈0 却有 26 条 used:有用的是被推到面前顺手用的,
  不是主动找的」,以及「纯 pull 不可单独成立:agent 不会去查它不知道存在的教训」。评论 `#cmqguxap`
  写「pull≈0 / judge-used~5%」。这些数字只以结论形式出现在评论里,**评论没有附样本量、时间范围或查询**。
- LUM-536 的 spike 结论(artifact `ugmld5ij`)是 GO,但它自己写明 N=1、执行会话评判自身、本地记忆是手工
  维护的。所有者在 `#cmqhtvsh` 补了一条:GO 的强度在机制论证,不在实证,不要当作已规模验证。
- 所以「agent 主动拉取约等于 0」是有原始记录的,但证据强度是 dogfood 观察加一次 spike,不是测量结论。

proofpress 这边,`docs/MATCHING-DISCUSSION.md` 把「发现候选」和「判断是否适用」分成两个阶段,发现阶段
允许用索引或可选的语义检索;当前实现只有精确 scope 加标量事实全等,缺一个事实就排除。它的评测计划
(`evals/README.md`)标题就是「not executed」。也就是说,它目前的检索方式是最小实现,不是被验证过的结论。

推荐方案的理由:准入是这次裁定的核心,投递方式不是;保留同步不改变「只有批准过的才生效」。它偏离了
「流程全部跟随」的字面意思,所有者已按推荐裁定(Decision 2)。

### 问题 2 的依据

- 工作区角色只有 OWNER 和 MEMBER(`prisma/schema.prisma:16`)。
- 「只能人在 Web 上做」已有现成做法:路由里判断 `identity.source !== 'clerk'` 就返回 403
  (`app/api/tasks/[id]/boundary-crossings/disposition/route.ts:28`;记忆的退役和合并路由也是这样,
  `app/api/memories/[memoryId]/retire/route.ts:25`、`app/api/projects/[id]/memories/merge/route.ts:33`)。
  这是内联判断,没有共用的 helper;实现时抽一个。字段名里的 clerk 是历史命名,指浏览器会话。
- 「允许在 CLI 上走确认握手来批准」也有先例:安全发现的处置允许 CLI key,靠确认协议加 `channel: 'CLI' | 'WEB'` 留痕
  (`app/api/tasks/[id]/security-findings/[findingId]/disposition/route.ts:50`)。
- 没有选「必须由提出者以外的人批准」:单人工作区会永远批不了自己提的东西。

需要说明的边界:这道检查挡的是 CLI key,挡不住能操作用户浏览器的 agent。proofpress 的 `SECURITY.md`
对自己也是同样的表述(所有者身份是自己声明的,不能当对抗性的审批边界)。本 RFC 不声称更强的保证。

## 4. 目标数据模型

新建三张表,不改 `memories` 表。理由:批准必须绑定一个不可变的确切修订,而现有修订链是「每个版本一行、
换 id」(`supersededById`),id 一变,同步文件名和 judged-used 履历都断了;新表也让第一阶段没有任何
破坏性迁移,回滚只需把设置调回去。

**`judgments`:一条 judgment 的稳定身份**

| 字段                      | 类型     | 说明                                      |
| ------------------------- | -------- | ----------------------------------------- |
| `id`                      | cuid     | 跨修订不变;同步文件名、履历都挂在它上面   |
| `workspaceId`             | string   | 租户边界,所有查询必带                     |
| `projectId`               | string?  | 为空表示工作区级                          |
| `name`                    | string   | 短标识,工作区内唯一                       |
| `activeRevisionId`        | string?  | 当前生效的已批准修订;为空表示没有生效版本 |
| `createdAt` / `updatedAt` | datetime |                                           |

**`judgment_revisions`:不可变的内容**

| 字段                                                   | 类型                    | 对应 proofpress           | 说明                                                                          |
| ------------------------------------------------------ | ----------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `id`、`judgmentId`、`version`                          | cuid、string、int       | id / version              | `(judgmentId, version)` 唯一                                                  |
| `digest`                                               | string                  | digest                    | 规范化内容的 sha256;批准、撤回都要带它                                        |
| `baseRevisionId`                                       | string?                 | links.revises             | 这一版改的是哪一版                                                            |
| `description`                                          | string                  | description               | 一行摘要,用作索引行                                                           |
| `statement`                                            | text                    | judgment.statement        |                                                                               |
| `kind`                                                 | enum                    | judgment.kind             | CONDITIONAL_GUIDANCE / CASE / HYPOTHESIS / CONSTRAINT                         |
| `rationale`                                            | text?                   | judgment.rationale        | 没记录就是 null,不许编                                                        |
| `polarity`                                             | enum?                   | judgment.polarity         | PREFER / AVOID                                                                |
| `assertionKey`、`assertionValue`                       | string?、json?          | judgment.assertion        | 可选;用于确定性的冲突检查                                                     |
| `scopeRepo`、`scopePathGlobs`、`scopeTopic`            | string?、json?、string? | applicability.scope       | 见下                                                                          |
| `when`                                                 | json                    | applicability.when        | `[{ field, equals }]`,只做标量全等                                            |
| `limits`                                               | json                    | applicability.limits      | 文字限制,至少一条;不参与匹配                                                  |
| `validFrom`、`validUntil`                              | datetime?               | valid_from / valid_until  | 到期时间不含当刻                                                              |
| `origin`                                               | enum                    | provenance.origin         | HUMAN_GUIDANCE / HUMAN_JUDGMENT / AGENT_JUDGMENT / AGENT_ASSUMPTION / UNKNOWN |
| `judgedByMemberId`、`judgedByLabel`                    | string?、string?        | provenance.judged_by      | 谁做的判断                                                                    |
| `recordedByMemberId`、`recordedByAgent`、`recordedVia` | string?、enum?、enum    | provenance.recorded_by    | `recordedVia` 取 WEB / CLI / PIPELINE,由服务端按凭证类型写,不接受请求体自报   |
| `captureMethod`                                        | enum                    | provenance.capture_method | EXPLICIT / EXTRACTED / IMPORTED / MIGRATED                                    |
| `sourceSessionId`、`sourceTaskId`、`sourceRefs`        | string?、string?、json  | provenance.source_refs    |                                                                               |
| `evidence`                                             | json                    | evidence                  | `[{ reference, role, summary }]`,role 取 supports / challenges / context      |
| `context`、`alternatives`、`expectedOutcome`           | json?                   | 同名                      |                                                                               |
| `state`                                                | enum                    | (本地治理)                | 见第 5 节                                                                     |
| `legacyMemoryId`                                       | string?                 | 无                        | 由哪条遗留记忆转来                                                            |
| `contentSignals`                                       | json?                   | 无                        | 沿用 LUM-783 的注入扫描结果                                                   |
| `embedding`                                            | vector(1024)?           | 无                        | 只用于查重提示和排序,不参与适用性判断                                         |

**`judgment_events`:只追加的治理记录**

`id`、`workspaceId`、`judgmentId`、`revisionId`、`revisionDigest`、`type`(PROPOSED / CHANGES_REQUESTED /
REJECTED / APPROVED / WITHDRAWN / EXPIRED / CONFLICT_FLAGGED)、`actorMemberId`、`channel`(WEB / CLI /
PIPELINE)、`reason`、`createdAt`。批准记录只在这张表里,导出 judgment 内容时不带出去(与 proofpress 一致:
批准权不随导出的 JSON 走)。

**适用范围(scope)。** proofpress 的 scope 是一个精确字符串,由调用方自己给。团队层不能靠 agent 自报,
所以拆成三个由系统能确定的部分:`projectId`(在 `judgments` 上)、`scopeRepo`("owner/name")、
`scopePathGlobs`。`scopeTopic` 是给人看的分组词,不参与匹配。按仓库和路径限定适用范围在 Lumo 已有先例:
`PrReviewLearning.repo` / `pathGlob`(`prisma/schema.prisma:1785`)。

**事实(facts)。** `when` 里可用的字段是一个小的固定词表,值只能来自服务端或 CLI 的确定来源,不接受 agent
陈述:`repo`、`agent`(CLAUDE_CODE / CODEX)、`task.tag`、`path`(本次任务改动过的路径)。缺事实即不匹配。
词表的扩充是后续任务。

**使用观察。** 沿用 judged-used 履历(`LineageEdge.used`,由
`lib/services/lineage/fragment-usage-audit.service.ts` 写入),给 `LineageFragmentType` 加一个 JUDGMENT 值
(纯新增)。它对应 proofpress 的 observations:只是附在某个修订上的观察,不改变准入状态。

## 5. 状态机

状态挂在修订上:

```
            ┌──────────── 修订(新的一版,PROPOSED)────────────┐
            │                                                    │
PROPOSED ──► CHANGES_REQUESTED ──(作者或审核人提新修订)────────┘
   │
   ├──► REJECTED            终态
   ├──► EXPIRED             候选超过 N 天无人处理,自动关闭;不删除,可重新提交
   └──► APPROVED ──► SUPERSEDED   同一 judgment 的更新修订被批准时,同一事务内完成
              └────► WITHDRAWN    终态
```

规则,全部跟随 proofpress(`docs/ARCHITECTURE.md`、`docs/AJF.md`):

- 批准的是带 `digest` 的确切修订。请求里的 digest 与库里不一致就拒绝。
- 批准新修订和把旧修订置为 SUPERSEDED 在同一事务里提交,同时更新 `judgments.activeRevisionId`。
- 待审的修订不影响当前生效的版本。
- 撤回不会让更早的版本复活;撤回后 `activeRevisionId` 为空。
- 审核人可以改内容,但「改」等于提一版新修订再批准它,不是原地编辑。
- `origin = UNKNOWN` 或 `rationale` 为空的修订不能批准(问题 6)。
- 有效期过了的已批准修订不再投递;这是读取时算出来的,不另存状态。
- agent 能做的:提候选、提修订、看、查。批准、驳回、要求修改、撤回只有人能做(问题 2)。

并发:

- 提修订必须带 `baseRevisionId`,它必须等于该 judgment 当前的 `activeRevisionId`(还没有生效版本时为空)。
  不相等返回 409。基线相同的多条候选修订可以并存。
- 批准在一个事务里做两个带条件的更新:修订上 `WHERE id = ? AND state = 'PROPOSED' AND digest = ?`;
  judgment 上 `WHERE id = ? AND activeRevisionId IS NOT DISTINCT FROM <该修订的 baseRevisionId>`。任一条
  影响 0 行就整体回滚。所以两个人同时批准同一 judgment 的两条候选时,后提交的失败,那条候选的基线已经
  过期,要基于新的生效版本重提。

冲突(Decision 10,跟随 proofpress 的 `docs/AJF.md`):

- 判定是确定性的:两条修订适用范围重叠,`assertionKey` 相同而 `assertionValue` 不同。没有填 `assertion` 的
  修订不参与。自然语言层面的冲突检查不在本 RFC 范围。
- 一旦判定冲突,记 CONFLICT_FLAGGED,涉及的候选不能批准,涉及的已批准修订停止投递,直到有人解决:驳回
  候选、撤回其中一方,或批准一版不再冲突的修订。解决后立刻恢复。
- 这是所有者的裁定(Decision 10),它的一个后果是:任何人或 agent 提一条带相反断言的候选,就会让对应的已批准 judgment 暂停投递,直到
  有人处理。所以冲突项在审核队列里置顶,暂停和恢复都写进 `judgment_events`,第 8 节的指标里统计暂停时长。

## 6. 方案细节

### 6.1 检索与投递(问题 1)

按 Decision 2 和 Decision 6:

- 工作区切换之后(第 8 节第 3 阶段),同步包(`lib/services/memory/memory-sync.service.ts`)只返回已批准、
  在有效期内、没有因冲突暂停的 judgment。遗留记忆不在其中。排序继续用 judged-used 履历。
- 过滤:同步时只用项目和仓库两级范围;路径和 `when` 用于会话开始时索引的排序,以及下面的查询命令。
- 会话开始注入的索引、attach 时的卡片、`lumo task show` 的 Relevant Memory 段沿用现有管线
  (`lib/services/task-context.service.ts`),数据源换成同一个集合。
- 新增 `lumo judgment context`,语义对应 proofpress 的 `context`:返回匹配的已批准修订和一个回执。
- **补一个现有缺口:** 同步路径(`lib/services/memory/sync-file-shape.ts`、`cli/src/lib/apply-sync.ts`、
  `cli/src/lib/managed-block.ts`)没有经过 `guardInjectedText`,也没有不可信标记,而注入路径有
  (`lib/memory/render.ts:98`)。改为在生成同步包时对正文过一遍 `guardInjectedText`。这是现有缺口,
  不属于任何阶段开关:作为第 0 阶段单独修,对所有工作区生效,不随开关回滚。
- 撤回要尽快生效:自动同步有 12 小时节流(`cli/src/commands/session-attach.ts:254`)。会话开始的 hook
  响应里带上同步包的版本号,版本变了就跳过节流重新同步。
- 本地文件被人改过时,现有逻辑按哈希跳过(`cli/src/lib/apply-sync.ts`)。保持不变;本地修改要回到团队层,
  只能作为候选修订提交。

### 6.2 谁有准入权(问题 2)

- 批准、驳回、要求修改、撤回四个动作:新路由,人类 Web 会话才放行,动作写进 `judgment_events`,带
  `channel`。
- 工作区设置 `judgmentAdmission`:ANY_MEMBER(默认)或 OWNER_ONLY。
- 提候选、提修订:任何身份都可以。`recordedVia` 由服务端按凭证类型写。
- 人类来源(HUMAN_GUIDANCE / HUMAN_JUDGMENT)只能由人类 Web 会话写入:要么人在 Web 上新建,要么审核人在
  审核时确认。经 CLI key 提交的内容一律存为 AGENT_JUDGMENT 或 AGENT_ASSUMPTION,不管请求里带了什么来源
  引用;agent 可以在 `judgedByLabel` 和 `sourceRefs` 里写明「这是某人说的、出处在哪」,由审核人核对后改
  来源。这同时修掉第 1 节说的来源标注问题。
- 成员被移出工作区后,他批准过的修订继续有效;事件里保留成员 id。

### 6.3 自动抽取的去留(问题 3)

按 Decision 4,`lib/services/memory/` 的去留见第 7 节。要点:

- 候选的自动来源只有三个:任务 DONE 时的 Layer2、里程碑复盘后的提炼、PR 评审线程里被判为可学习的人类
  回复(`lib/services/memory-management.service.ts:302`)。产出一律是 PROPOSED,`captureMethod = EXTRACTED`,
  `kind` 默认 HYPOTHESIS。
- 显式来源:agent 或人运行 `lumo judgment propose`;Web 上新建。用 `lumo task decide` 记下的任务决定是
  质量最高的来源(人说的原话,带任务号),在任务决定旁边提供「提为候选」。
- 模型不再能改动或删除已生效的内容。Layer2 调和出的 UPDATE / SUPERSEDE 改为「对某条 judgment 提一版
  候选修订」;NOOP 不变。
- `lumo memory project-add`、`push`、`promote` 这些手动入口也改为产生候选,`captureMethod = EXPLICIT`。
- 任务级工作笔记(`MemoryScope.TASK`)停止注入(Decision 11),细节见下。

**任务级笔记下线的细节。** 核实到两处依赖,实现时要先处理:

- Layer1 的第一次模型调用同时产出回合摘要和记忆候选(`lib/services/memory/layer1.service.ts`,摘要经
  `hookEventRepository.setTurnSummary` 写入)。回合摘要有别的用途(例如 `lib/agent-run/run-digest.ts`),
  它是单独的 AI 功能开关(`lib/ai-features/registry.ts` 的 `turnSummary`)。所以下线的是候选抽取、调和
  和写入;摘要这一半要拆出来保留。
- Layer2 现在的输入就是任务级笔记(`lib/services/memory/layer2-input.ts`,每个项目最多 200 条)。笔记
  不再写之后,Layer2 要改成直接读任务的回合摘要、任务决定和会话事件。**改输入之后 Layer2 的产出质量
  没有数据**,需要用现有的评测脚本(`scripts/eval/memory/`)重跑一次再上线。

切换之后:任务级笔记不再出现在会话开始、attach 和 `lumo task show` 里;同一任务的后续会话靠回合摘要和
任务决定续接。`lumo memory task-add` 改为提一条候选(带 `sourceTaskId`)。已有的任务级笔记和其他遗留
记忆一样,不投递,可以转成候选。

### 6.4 分类与 kind(问题 4)

默认映射只用于预填,审核人可以改:

| 现有分类                                                  | 默认 kind                                            | statement                 | rationale | 其他字段                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------- | --------- | ---------------------------------------------------------------------------------- |
| TRAP(`trigger`、`outcome`、`workaround?`)                 | CASE;审核人推广时改为 CONSTRAINT 且 polarity = AVOID | `trigger` 加 `workaround` | `outcome` | `context.situation` ← `trigger`                                                    |
| DECISION(`what`、`why`、`alternatives?`、`implications?`) | CONDITIONAL_GUIDANCE                                 | `what`                    | `why`     | `alternatives[].option` ← `alternatives`,未选理由留 null;`limits` ← `implications` |
| CONVENTION(`rule`、`scope`)                               | CONSTRAINT                                           | `rule`                    | null      | `limits` ← `scope`(它是自由文本)                                                   |
| PROCEDURAL(`workflow`、`trigger`、`steps?`)               | CONDITIONAL_GUIDANCE                                 | `workflow` 加 `steps`     | null      | `context.situation` ← `trigger`                                                    |

字段定义见 `lib/memory/schemas.ts`。两点后果要知道:

- CONVENTION 和 PROCEDURAL 没有理由字段,转过来 `rationale` 一定是 null,按 Decision 7 不能直接批准,
  审核人要补。所有者本地的 66 条里这两类共 9 条(TRAP 49、DECISION 8、PROCEDURAL 6、CONVENTION 3,
  2026-11-18 数自 `team/INDEX.md`)。
- 现有内容没有结构化的适用条件,转过来 `when` 是空数组,`limits` 至少要有一条,预填为「由遗留记忆转入,
  适用条件未经审核」。

### 6.5 存量(问题 5)

见第 9 节。

### 6.6 团队层的新问题

| 问题             | 方案                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 多人并发修订     | 修订不可变;提修订带 `baseRevisionId`,不等于当前生效版本则 409;基线相同的候选可以并存                                                       |
| 成员之间的冲突   | 基线相同的候选修订并存,审核人批准其一,其余因基线过期需要重提;`assertion` 冲突按第 5 节暂停准入和投递                                       |
| 同步到每个人本地 | 只同步已批准的;文件名用 `judgments.id`,修订后文件名不变;撤回触发重新同步                                                                   |
| 租户隔离         | 三张表都带 `workspaceId`;路由统一校验工作区;批准记录不导出。行级安全的总体方案见 `docs/rfc/LUM-980-postgres-rls.md`                        |
| 数据保留与删除   | 工作区级批量删除(LUM-917,`lib/repositories/ai-derived-content.repository.ts`)要覆盖新表                                                    |
| 不可信文本       | 候选和修订在写入时走现有 poison gate(`lib/memory/poison-gate.ts`)并存 `contentSignals`;批准页面显示信号;渲染和同步都过 `guardInjectedText` |

## 7. `lib/services/memory/` 各模块的去留

「保留」指逻辑不变;「改接」指保留逻辑但输出从改 ACTIVE 行变成产生候选或提示;「限定」指只服务还没有切换的
工作区,最终随遗留记忆一起退场。

| 模块                                                                                                                | 现在做什么                                    | 去留                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `layer1.service` / `layer1-extract` / `layer1-input` / `layer1-prompt` / `layer1-reconcile-prompt` / `layer1-apply` | 每回合产出回合摘要,并抽取、调和、直接写入记忆 | 下线记忆抽取(Decision 11):只保留回合摘要这一半;调和与写入随未切换的工作区一起退场 |
| `local-grounding`                                                                                                   | 校验 Layer1 候选引用的原话确实出现在回合里    | 限定:只被 Layer1 使用,随它退场                                                    |
| `layer2.service` / `layer2-extract` / `layer2-input` / `layer2-prompt` / `layer2-reconcile-prompt`                  | 任务 DONE 时从任务级笔记合并出项目级记忆      | 改接:输入改为回合摘要、任务决定和会话事件;输出候选和候选修订                      |
| `layer2-apply`                                                                                                      | 写 ACTIVE 项目级行和 `MemoryProvenance`       | 改接:写 PROPOSED 修订;来源会话和任务记进 `sourceRefs`                             |
| `milestone-distill.service` / `-extract` / `-input` / `-apply`                                                      | 复盘后写 ACTIVE 里程碑级记忆                  | 改接:输出候选                                                                     |
| `ground-candidates`                                                                                                 | 模型做的「给出引用否则丢弃」                  | 保留;引用写进 `evidence`                                                          |
| `extraction-gate` / `screen-rejection`                                                                              | 拒收半句碎片和与 CLAUDE.md 重复的内容         | 保留,用在候选创建时                                                               |
| `write-gate` 与 `lib/memory/poison-gate`                                                                            | 注入信号、agent 指令、与策略规则冲突          | 保留,用在候选创建和提修订时                                                       |
| `neighbor-retriever` / `embedding-neighbor-retriever` / `near-dup` / `manual-dedup` / `reconcile-parse`             | 找相近的已有记忆并决定合并                    | 改接:只提示「与已批准的某条相近」,并把候选转成对那条的修订;不自动合并             |
| `supersede-guard`                                                                                                   | 阻止模型覆盖被多次判定用到的记忆              | 限定:模型不能再覆盖已批准内容后失去作用,随遗留记忆退场                            |
| `used-trap-delete`                                                                                                  | agent 硬删除被用过的 TRAP 时记一次越界        | 限定:只对遗留记忆有效。agent 不能删除已批准的 judgment                            |
| `curation.service` / `curation-judge`                                                                               | DONE 时模型把明显错的记忆置为 INVALIDATED     | 改接:对已批准的只附一条 challenges 证据并提示审核人;未切换的工作区保持现状        |
| `retire.service`                                                                                                    | 列出退役候选,人确认后归档                     | 改接:候选信号不变,动作变成「建议撤回」,由人撤回                                   |
| `batch-consolidate.service`                                                                                         | 近重复合并建议,人确认后归档                   | 改接:合并变成「对保留的那条提修订,其余建议撤回」                                  |
| `fold.service` / `fold-compute` / `fold-dispatch` 与 `lib/memory/fold-schemas`                                      | 超过 80 条时把细卡折成粗卡并替换原卡          | 限定:只对遗留记忆运行。对已批准内容关闭,因为它在没有审核的情况下改写内容          |
| `compaction.service`                                                                                                | 每小时把最冷的记忆归档                        | 限定:只对遗留记忆。候选的过期由状态机的 EXPIRED 处理                              |
| `relevance-gate` / `relevance-gate.constants` / `index-disclosure` / `disclosure-reachability`                      | 会话开始时选哪些进索引                        | 保留;前面加一层适用范围过滤                                                       |
| `memory-read.service`                                                                                               | 按 id 读取                                    | 保留;新增 judgment 的读取                                                         |
| `memory-sync.service` / `sync-bundle` / `sync-file-shape`                                                           | 生成同步包和本地文件形态                      | 保留并扩展:加入 judgment、加注入防护、加版本号                                    |
| `canonicalize-language`                                                                                             | 把中文内容转成英文再存                        | 保留,用于候选;原文保留在 `sourceRefs` 指向的来源里                                |
| `constitution`                                                                                                      | 读取仓库的 CLAUDE.md / AGENTS.md              | 保留                                                                              |
| `lib/memory/content-text` / `render` / `list-view` / `schemas` / `pipeline-switch`                                  | 文本化、渲染、列表、内容 schema、总开关       | 保留;`render` 增加 judgment 的渲染;`schemas` 随遗留记忆退场                       |

入口的变化:

- CLI:新增 `lumo judgment propose | revise | list | show | inbox | context`。`lumo memory task-add`、`project-add`、`push`、`promote`
  改为产生候选;`lumo memory task-list` 只在未切换的工作区有内容;`lumo memory delete` 对已批准内容返回拒绝。
  改 `cli/src/commands/` 要同步 `cli/skill/` 并重新生成 grammar.json。
- Web:记忆页增加「待审」队列和审核页(看确切修订、信号、相近条目、来源,可编辑后批准)。
- 会话开始的 Review needed 段(`lib/memory/render.ts:218`)在第 3 阶段删除,它被人的审核队列取代。

## 8. 分阶段计划

每阶段可单独发布。第 1 到 3 阶段由一个工作区级设置控制,它有三个值:OFF(今天的行为)、REVIEW(第 1、2
阶段:可以提候选、转换和审核,投递不变)、CUTOVER(第 3 阶段)。往回调一档就回到上一阶段的行为;第 0 阶段
没有开关。

| 阶段       | 内容                                                                                                                                                                                                                                                                                                                                   | 上线后的行为变化                                                       | 回滚                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0 补缺口   | 同步路径加注入防护(6.1)                                                                                                                                                                                                                                                                                                                | 所有工作区的同步文件都经过防护                                         | 回退这次发布                                                                                                                            |
| 1 准入     | 三张新表(纯新增迁移);`lumo judgment propose / revise / list / show / inbox`;Web 审核队列与批准、驳回、要求修改、撤回;冲突判定;写入防护;来源标注修正                                                                                                                                                                                    | 可以提候选、可以审核;投递不变,仍是遗留记忆                             | 设置调回 OFF;新表留着不用                                                                                                               |
| 2 存量转换 | 遗留记忆逐条和批量「转成候选」;审核页显示遗留来源;`lumo judgment context`;切换前的预览(切换后 agent 会收到哪些、会少掉哪些)                                                                                                                                                                                                            | 工作区可以在切换前把要留的遗留记忆审完;投递不变                        | 设置调回 OFF                                                                                                                            |
| 3 切换     | 设置调到 CUTOVER 时同时做三件事:投递改为只有已批准的 judgment(同步包、会话开始索引、attach 卡片、`task show`);Layer2、里程碑提炼、PR 评审学习、手动添加改为产生候选,Layer1 的记忆抽取停止、任务级笔记不再注入;fold、冷淘汰、DONE 失效判定不再改动项目级内容,Review needed 段不再出现。judged-used 覆盖 judgment;撤回和冲突触发重新同步 | agent 只收到批准过的内容;遗留记忆停止投递;不再产生新的未审核项目级记忆 | 设置调回 REVIEW 或 OFF:投递回到遗留记忆,抽取恢复直接写 ACTIVE。遗留行全程没被改过,不需要恢复脚本;切换期间没有写下的任务级笔记不会补回来 |
| 4 收尾     | 所有工作区切换完之后,删除只服务遗留记忆的模块和开关;如需删除列、表或枚举值,按 `docs/database-migrations.md` 分两次发布                                                                                                                                                                                                                 | 无对客变化                                                             | 收尾本身不可逆,单独裁定                                                                                                                 |

切换是每个工作区自己的动作,由 OWNER 在设置里调到 CUTOVER;新建的工作区是否默认已切换,以及是否给存量工作区定
一个统一的切换期限,等 Decision 9 说的指标出来后再定。在那之前,没切换的工作区保持今天的行为。

在 Lumo 自己的工作区切换前后要看的指标(Decision 9):

- 每周新增候选数,按来源分(显式提交、Layer2、里程碑、PR 评审)。
- 候选从提出到被处理的中位时间;超过 14 天未处理的数量。
- 批准、驳回、要求修改各占多少;批准前被审核人改过的比例。
- judged-used:切换前的遗留记忆对比切换后的已批准 judgment,被判定用到的比例。两段时间不重叠,任务也
  不同,只能当作粗略对比。
- 切换当天投递条数从多少变成多少。
- 因冲突暂停的次数和暂停时长;撤回数和撤回原因。

目前**没有任何数据**说明经人审核的 judgment 比现有记忆效果更好:proofpress 的评测没有执行,Lumo 这边也
没有测过。这组指标就是用来回答这个问题的;如果审核队列持续积压或 judged-used 没有改善,不应该对客户
默认开启。

## 9. 存量迁移与回滚

按 Decision 6:遗留记忆不投递,只作为转换材料。

1. **不动数据。** 现有 `memories` 行保持原样,状态也不改。切换前它们照旧投递;切换后投递路径不再读它们。
2. **逐条转换。** 记忆页每条遗留记忆有「转成候选」:按 6.4 的映射预填一条 PROPOSED 修订,
   `captureMethod = MIGRATED`,`origin` 一律预填 UNKNOWN(因为第 1 节的标注问题,有成员 id 也不能证明是
   人写的),`legacyMemoryId` 指回原行。审核人补全来源、理由和适用条件后批准。
3. **批量转换。** 按分类或按 judged-used 排序批量生成候选;映射是确定性的,不调用模型。
4. **切换前预览。** 设置页在调到 CUTOVER 之前显示:已批准多少条、还有多少条遗留记忆没转换、切换后 agent 收到的
   条数会怎么变。没有任何已批准内容时,调到 CUTOVER 需要再确认一次。
5. **切换后。** 遗留记忆仍可查看、仍可继续转换,只是不再投递。

对客影响要在 PR 描述和发布说明里写明:工作区切换的那一刻,没有被转换并批准的团队记忆不再到达 agent。
因为 CONVENTION 和 PROCEDURAL 转过来没有理由、所有遗留记忆转过来来源都是未知,**每一条都需要人补内容
才能批准**,不存在一键全部批准。

回滚:

- 任何时候把设置调回 REVIEW 或 OFF,投递回到只看 `memories`,行为与今天一致。转换和批准都没有改过遗留行,不需要恢复。
- 全程不删除 `memories` 行,不删除 `prisma/migrations/` 里的文件。
- `MemoryCategory`、`MemoryStatus`、`MemoryScope` 的枚举值在第 4 阶段之前都不动。

**未核实的数量。** 生产库和其他工作区有多少条记忆、各分类多少,本次没有查(本机没有可用的生产只读凭证)。
在决定是否给存量工作区定切换期限之前需要这组数,建议由所有者在自己的终端跑一个只读计数脚本。

## 10. 留给实现者

- 字段级 schema 以第 4 节为准;规范化内容并计算 `digest` 的函数要有固定的字段顺序和测试向量。
- 抽一个「必须是人类 Web 会话」的共用检查,替换现有各处内联的 `identity.source !== 'clerk'`。
- 对客文案走 react-intl,所有 locale 文件一起更新;文案里不出现其他产品的名字。
- `lumo memory show` 现在按 id 读取时不过滤状态(`lib/repositories/memory.repository.ts:476`),judgment 的
  读取要默认只返回生效修订,看历史修订需要显式参数。
- 本文没有覆盖:导入导出格式、依赖关系(`depends_on`)、可选的模型辅助审核。它们都可以在第 3 阶段之后
  单独提出。
