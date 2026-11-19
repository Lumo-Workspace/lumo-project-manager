# 把 Lumo 记忆改成经人审核的 judgment

日期:2026-11-18 · 任务:LUM-1354 · 状态:待所有者裁定(第 3 节列出 8 个问题)

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
- 分阶段上线,每一阶段可单独发布、可单独回滚;存量客户的记忆不会在某一天突然消失。

**非目标**

- 不引入 proofpress 的代码,不依赖它的版本。只参考字段设计和流程,不复制它的 JSON Schema 文件,
  所以不涉及 Apache-2.0 的许可声明。
- 不做「绑定到工具调用的拦截」。proofpress 自己的设计讨论把它列为未实现的后续方向,并且要求走
  完整登记的动作索引而不是检索。Lumo 的越界检测器、策略规则、安全扫描本 RFC 不动。
  唯一的接触点保持现状:写入时用项目策略规则做冲突检查(`lib/services/memory/write-gate.ts`)。
- 不改任务级工作笔记的用途(见问题 3)。

**做到了也算失败**

- 存量记忆被整体降级,客户的 agent 第二天拿不到任何团队记忆。
- 审核队列没人看,团队记忆从此不再增长,却没有任何指标提示。
- agent 能通过任何路径让自己提的内容生效。

## 3. 需要所有者裁定的问题

每条给出推荐和备选。裁定后用 `lumo task decide LUM-1354 "<内容>"` 记到任务上。

| #   | 问题              | 推荐                                                                                                                      | 备选                                                                                         |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | 检索与投递        | 准入、修订、撤回跟随;投递保留「同步到本地 + 常驻索引」,只投递已批准的;适用条件用来过滤和排序,另加一个按条件精确查询的命令 | (b) 检索也完全跟随:agent 必须带 scope 和事实来查,停掉同步 (c) 两条都留但同步只给索引不给正文 |
| 2   | 谁能批准          | 工作区里任何人类成员,只能在 Web 上操作;agent(CLI key)一律不行;工作区可以收紧为仅 OWNER                                    | (b) 仅 OWNER (c) 必须是提出者以外的人 (d) 允许 CLI 走「先读后裁」的确认握手                  |
| 3   | 自动抽取          | 保留,但只产生候选;候选只在任务 DONE 时由 Layer2 产生;Layer1 只写任务级工作笔记,不再写项目级、不再删除                     | (b) 整体下线,只留显式提交 (c) Layer1 也直接产生候选                                          |
| 4   | 分类怎么对应 kind | 不做一一对应:给出默认映射,由审核人最终选定;自动抽取的候选默认是 `hypothesis`                                              | (b) 保留四个分类,kind 只作附加标签                                                           |
| 5   | 存量记忆          | 原地保留并继续投递,标记为「未审核的遗留记忆」;提供逐条和批量「转成候选」;停用日期由每个工作区的 OWNER 自己定,默认不设     | (b) 全部降为候选,立刻停止投递 (c) 清空重来                                                   |
| 6   | 缺理由能不能批准  | 跟随 proofpress 的默认:来源未知或理由为空的修订不能批准,审核人要先补一版                                                  | (b) 允许审核人勾选「理由未知,仍然批准」                                                      |
| 7   | 对客名称          | 产品里仍叫团队记忆(Team memory),条目状态显示「待审 / 已批准 / 已撤回」;内部模型叫 Judgment                                | (b) 对客也改叫 judgment                                                                      |
| 8   | 上线范围          | 第 1、2 阶段先只在 Lumo 自己的工作区打开,量出第 8 节的指标后再决定第 3 阶段是否对客户默认开启                             | (b) 一次对所有工作区开启                                                                     |

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

推荐方案的理由:准入是这次裁定的核心,投递方式不是;保留同步不改变「只有批准过的才生效」。风险在于
这偏离了「流程全部跟随」的字面意思,所以留给所有者裁定。选 (b) 的代价是:在没有新数据的情况下,
把现有唯一有使用记录的投递通道停掉。

### 问题 2 的依据

- 工作区角色只有 OWNER 和 MEMBER(`prisma/schema.prisma:16`)。
- 「只能人在 Web 上做」已有现成做法:路由里判断 `identity.source !== 'clerk'` 就返回 403
  (`app/api/tasks/[id]/boundary-crossings/disposition/route.ts:28`;记忆的退役和合并路由也是这样,
  `app/api/memories/[memoryId]/retire/route.ts:25`、`app/api/projects/[id]/memories/merge/route.ts:33`)。
  这是内联判断,没有共用的 helper;实现时抽一个。字段名里的 clerk 是历史命名,指浏览器会话。
- 备选 (d) 也有先例:安全发现的处置允许 CLI key,靠确认协议加 `channel: 'CLI' | 'WEB'` 留痕
  (`app/api/tasks/[id]/security-findings/[findingId]/disposition/route.ts:50`)。
- 不推荐 (c) 作为默认:单人工作区会永远批不了自己提的东西。

需要说明的边界:这道检查挡的是 CLI key,挡不住能操作用户浏览器的 agent。proofpress 的 `SECURITY.md`
对自己也是同样的表述(所有者身份是自己声明的,不能当对抗性的审批边界)。本 RFC 不声称更强的保证。

## 4. 目标数据模型

新建三张表,不改 `memories` 表。理由:批准必须绑定一个不可变的确切修订,而现有修订链是「每个版本一行、
换 id」(`supersededById`),id 一变,同步文件名和 judged-used 履历都断了;新表也让第一阶段没有任何
破坏性迁移,回滚只需关开关。

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

并发:提修订必须带 `baseRevisionId`,它不是该 judgment 的最新修订时返回 409,让提交方基于最新版重提。
批准用带条件的更新(`WHERE state = 'PROPOSED' AND digest = ?`),两个人同时批准同一 judgment 的两个修订时,
后提交的那个因为 `activeRevisionId` 已变而失败,需要重新看一遍。

冲突:两条已批准的 judgment 范围重叠、`assertionKey` 相同而值不同时,记 CONFLICT_FLAGGED。新候选与已批准的
冲突时,候选不能批准,直到其中一方被修订或撤回。已经生效的不因为一条候选而停止投递。自然语言层面的冲突
检查不在本 RFC 范围。

## 6. 六个问题的方案细节

### 6.1 检索与投递(问题 1)

按推荐方案:

- 同步包(`lib/services/memory/memory-sync.service.ts`)改为返回「已批准且在有效期内的 judgment」加
  「遗留记忆」。排序继续用 judged-used 履历。
- 过滤:同步时只用项目和仓库两级范围;路径和 `when` 用于会话开始时索引的排序,以及下面的查询命令。
- 会话开始注入的索引、attach 时的卡片、`lumo task show` 的 Relevant Memory 段沿用现有管线
  (`lib/services/task-context.service.ts`),数据源换成同一个集合。
- 新增 `lumo judgment context`,语义对应 proofpress 的 `context`:返回匹配的已批准修订和一个回执。
- **补一个现有缺口:** 同步路径(`lib/services/memory/sync-file-shape.ts`、`cli/src/lib/apply-sync.ts`、
  `cli/src/lib/managed-block.ts`)没有经过 `guardInjectedText`,也没有不可信标记,而注入路径有
  (`lib/memory/render.ts:98`)。改为在生成同步包时对正文过一遍 `guardInjectedText`。
- 撤回要尽快生效:自动同步有 12 小时节流(`cli/src/commands/session-attach.ts:254`)。会话开始的 hook
  响应里带上同步包的版本号,版本变了就跳过节流重新同步。
- 本地文件被人改过时,现有逻辑按哈希跳过(`cli/src/lib/apply-sync.ts`)。保持不变;本地修改要回到团队层,
  只能作为候选修订提交。

### 6.2 谁有准入权(问题 2)

- 批准、驳回、要求修改、撤回四个动作:新路由,人类 Web 会话才放行,动作写进 `judgment_events`,带
  `channel`。
- 工作区设置 `judgmentAdmission`:ANY_MEMBER(默认)或 OWNER_ONLY。
- 提候选、提修订:任何身份都可以。`recordedVia` 由服务端按凭证类型写。经 CLI key 提交的内容,
  `origin` 不能是 HUMAN_GUIDANCE / HUMAN_JUDGMENT,除非 `sourceRefs` 里有可核对的来源(会话 id、
  任务决定的编号);否则服务端降为 AGENT_JUDGMENT。这同时修掉第 1 节说的来源标注问题。
- 成员被移出工作区后,他批准过的修订继续有效;事件里保留成员 id。

### 6.3 自动抽取的去留(问题 3)

按推荐方案,`lib/services/memory/` 的去留见第 7 节。要点:

- 候选的自动来源只有三个:任务 DONE 时的 Layer2、里程碑复盘后的提炼、PR 评审线程里被判为可学习的人类
  回复(`lib/services/memory-management.service.ts:302`)。产出一律是 PROPOSED,`captureMethod = EXTRACTED`,
  `kind` 默认 HYPOTHESIS。
- 显式来源:agent 或人运行 `lumo judgment propose`;Web 上新建。用 `lumo task decide` 记下的任务决定是
  质量最高的来源(人说的原话,带任务号),在任务决定旁边提供「提为候选」。
- 模型不再能改动或删除已生效的内容。Layer2 调和出的 UPDATE / SUPERSEDE 改为「对某条 judgment 提一版
  候选修订」;NOOP 不变。
- 任务级工作笔记(`MemoryScope.TASK`)留在 `memories` 表,继续由 Layer1 自动写,只注入同一任务的后续会话,
  从不同步(现状就是这样:同步包只取项目级)。它不是团队判断,不进审核。

不推荐 (c) 的原因:Layer1 每个 Stop 回合都跑,候选量会远多于人能审的量。**这个量没有实测数据**,
第 8 节的指标里包含它。

### 6.4 分类与 kind(问题 4)

默认映射只用于预填,审核人可以改:

| 现有分类                                                  | 默认 kind                                            | statement                 | rationale | 其他字段                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------- | --------- | ---------------------------------------------------------------------------------- |
| TRAP(`trigger`、`outcome`、`workaround?`)                 | CASE;审核人推广时改为 CONSTRAINT 且 polarity = AVOID | `trigger` 加 `workaround` | `outcome` | `context.situation` ← `trigger`                                                    |
| DECISION(`what`、`why`、`alternatives?`、`implications?`) | CONDITIONAL_GUIDANCE                                 | `what`                    | `why`     | `alternatives[].option` ← `alternatives`,未选理由留 null;`limits` ← `implications` |
| CONVENTION(`rule`、`scope`)                               | CONSTRAINT                                           | `rule`                    | null      | `limits` ← `scope`(它是自由文本)                                                   |
| PROCEDURAL(`workflow`、`trigger`、`steps?`)               | CONDITIONAL_GUIDANCE                                 | `workflow` 加 `steps`     | null      | `context.situation` ← `trigger`                                                    |

字段定义见 `lib/memory/schemas.ts`。两点后果要知道:

- CONVENTION 和 PROCEDURAL 没有理由字段,转过来 `rationale` 一定是 null,按问题 6 的推荐不能直接批准,
  审核人要补。所有者本地的 66 条里这两类共 9 条(TRAP 49、DECISION 8、PROCEDURAL 6、CONVENTION 3,
  2026-11-18 数自 `team/INDEX.md`)。
- 现有内容没有结构化的适用条件,转过来 `when` 是空数组,`limits` 至少要有一条,预填为「由遗留记忆转入,
  适用条件未经审核」。

### 6.5 存量(问题 5)

见第 9 节。

### 6.6 团队层的新问题

| 问题             | 方案                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 多人并发修订     | 修订不可变;提修订带 `baseRevisionId`,不是最新则 409                                                                                        |
| 成员之间的冲突   | 两条候选修订并存,审核人批准其一,另一条因基线过期需要重提;`assertion` 冲突做确定性标记                                                      |
| 同步到每个人本地 | 只同步已批准的和遗留的;文件名用 `judgments.id`,修订后文件名不变;撤回触发重新同步                                                           |
| 租户隔离         | 三张表都带 `workspaceId`;路由统一校验工作区;批准记录不导出。行级安全的总体方案见 `docs/rfc/LUM-980-postgres-rls.md`                        |
| 数据保留与删除   | 工作区级批量删除(LUM-917,`lib/repositories/ai-derived-content.repository.ts`)要覆盖新表                                                    |
| 不可信文本       | 候选和修订在写入时走现有 poison gate(`lib/memory/poison-gate.ts`)并存 `contentSignals`;批准页面显示信号;渲染和同步都过 `guardInjectedText` |

## 7. `lib/services/memory/` 各模块的去留

「保留」指逻辑不变;「改接」指保留逻辑但输出从改 ACTIVE 行变成产生候选或提示;「限定」指只服务任务级
笔记或遗留记忆,最终随它们一起退场。

| 模块                                                                                                                | 现在做什么                                | 去留                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `layer1.service` / `layer1-extract` / `layer1-input` / `layer1-prompt` / `layer1-reconcile-prompt` / `layer1-apply` | 每回合抽取并直接写入,可写项目级、可硬删除 | 限定:只写任务级笔记;去掉项目级 ADD 和对项目级行的 DELETE / SUPERSEDE     |
| `local-grounding`                                                                                                   | 校验候选引用的原话确实出现在回合里        | 保留                                                                     |
| `layer2.service` / `layer2-extract` / `layer2-input` / `layer2-prompt` / `layer2-reconcile-prompt`                  | 任务 DONE 时合并出项目级记忆              | 改接:输出候选和候选修订                                                  |
| `layer2-apply`                                                                                                      | 写 ACTIVE 项目级行和 `MemoryProvenance`   | 改接:写 PROPOSED 修订;来源任务笔记记进 `sourceRefs`                      |
| `milestone-distill.service` / `-extract` / `-input` / `-apply`                                                      | 复盘后写 ACTIVE 里程碑级记忆              | 改接:输出候选                                                            |
| `ground-candidates`                                                                                                 | 模型做的「给出引用否则丢弃」              | 保留;引用写进 `evidence`                                                 |
| `extraction-gate` / `screen-rejection`                                                                              | 拒收半句碎片和与 CLAUDE.md 重复的内容     | 保留,用在候选创建时                                                      |
| `write-gate` 与 `lib/memory/poison-gate`                                                                            | 注入信号、agent 指令、与策略规则冲突      | 保留,用在候选创建和提修订时                                              |
| `neighbor-retriever` / `embedding-neighbor-retriever` / `near-dup` / `manual-dedup` / `reconcile-parse`             | 找相近的已有记忆并决定合并                | 改接:只提示「与已批准的某条相近」,并把候选转成对那条的修订;不自动合并    |
| `supersede-guard`                                                                                                   | 阻止模型覆盖被多次判定用到的记忆          | 限定:模型不能再覆盖已批准内容后失去作用,随遗留记忆退场                   |
| `used-trap-delete`                                                                                                  | agent 硬删除被用过的 TRAP 时记一次越界    | 限定:只对遗留记忆有效。agent 不能删除已批准的 judgment                   |
| `curation.service` / `curation-judge`                                                                               | DONE 时模型把明显错的记忆置为 INVALIDATED | 改接:对已批准的只附一条 challenges 证据并提示审核人;对遗留记忆保持现状   |
| `retire.service`                                                                                                    | 列出退役候选,人确认后归档                 | 改接:候选信号不变,动作变成「建议撤回」,由人撤回                          |
| `batch-consolidate.service`                                                                                         | 近重复合并建议,人确认后归档               | 改接:合并变成「对保留的那条提修订,其余建议撤回」                         |
| `fold.service` / `fold-compute` / `fold-dispatch` 与 `lib/memory/fold-schemas`                                      | 超过 80 条时把细卡折成粗卡并替换原卡      | 限定:只对遗留记忆运行。对已批准内容关闭,因为它在没有审核的情况下改写内容 |
| `compaction.service`                                                                                                | 每小时把最冷的记忆归档                    | 限定:只对遗留记忆。候选的过期由状态机的 EXPIRED 处理                     |
| `relevance-gate` / `relevance-gate.constants` / `index-disclosure` / `disclosure-reachability`                      | 会话开始时选哪些进索引                    | 保留;前面加一层适用范围过滤                                              |
| `memory-read.service`                                                                                               | 按 id 读取                                | 保留;新增 judgment 的读取                                                |
| `memory-sync.service` / `sync-bundle` / `sync-file-shape`                                                           | 生成同步包和本地文件形态                  | 保留并扩展:加入 judgment、加注入防护、加版本号                           |
| `canonicalize-language`                                                                                             | 把中文内容转成英文再存                    | 保留,用于候选;原文保留在 `sourceRefs` 指向的来源里                       |
| `constitution`                                                                                                      | 读取仓库的 CLAUDE.md / AGENTS.md          | 保留                                                                     |
| `lib/memory/content-text` / `render` / `list-view` / `schemas` / `pipeline-switch`                                  | 文本化、渲染、列表、内容 schema、总开关   | 保留;`render` 增加 judgment 的渲染;`schemas` 随遗留记忆退场              |

入口的变化:

- CLI:新增 `lumo judgment propose | revise | list | show | inbox | context`。`lumo memory task-*` 继续管任务
  笔记;`lumo memory project-add`、`push`、`promote` 改为产生候选;`lumo memory delete` 对已批准内容返回拒绝。
  改 `cli/src/commands/` 要同步 `cli/skill/` 并重新生成 grammar.json。
- Web:记忆页增加「待审」队列和审核页(看确切修订、信号、相近条目、来源,可编辑后批准)。
- 会话开始的 Review needed 段(`lib/memory/render.ts:218`)在第 3 阶段删除,它被人的审核队列取代。

## 8. 分阶段计划

每阶段可单独发布;开关是工作区级的,关掉即回到上一阶段的行为。

| 阶段       | 内容                                                                                                                                                       | 上线后的行为变化                               | 回滚                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| 1 准入     | 三张新表(纯新增迁移);`lumo judgment propose / revise / list / show / inbox`;Web 审核队列与批准、驳回、要求修改、撤回;写入防护;来源标注修正                 | 可以提候选、可以审核;投递不变                  | 关开关;新表留着不用                          |
| 2 投递     | 同步包、会话开始索引、`task show` 纳入已批准的 judgment;适用范围过滤;同步路径加注入防护;撤回触发重新同步;`lumo judgment context`;judged-used 覆盖 judgment | agent 开始收到已批准的 judgment,与遗留记忆并存 | 关开关;同步包回到只有遗留记忆                |
| 3 抽取改道 | Layer2、里程碑提炼、PR 评审学习、手动添加改为产生候选;Layer1 限定为任务级;fold、冷淘汰、DONE 失效判定对已批准内容关闭;删除 Review needed 段                | 不再产生新的未审核项目级记忆                   | 关开关;抽取恢复直接写 ACTIVE                 |
| 4 存量转换 | 遗留记忆逐条和批量「转成候选」;审核页显示遗留来源;OWNER 可设遗留记忆停用日期                                                                               | 遗留记忆逐步被已批准的 judgment 取代           | 见第 9 节                                    |
| 5 收尾     | 删除只服务遗留记忆的模块和开关;如需删除列、表或枚举值,按 `docs/database-migrations.md` 分两次发布                                                          | 无对客变化                                     | 收尾前保留全部旧数据,收尾本身不可逆,单独裁定 |

第 2 阶段结束、第 3 阶段开始之前要看的指标(问题 8):

- 每周新增候选数,按来源分(显式提交、Layer2、里程碑、PR 评审)。
- 候选从提出到被处理的中位时间;超过 14 天未处理的数量。
- 批准、驳回、要求修改各占多少;批准前被审核人改过的比例。
- judged-used:已批准的 judgment 对比遗留记忆,在相同时间窗内被判定用到的比例。
- 撤回数和撤回原因。

目前**没有任何数据**说明经人审核的 judgment 比现有记忆效果更好:proofpress 的评测没有执行,Lumo 这边也
没有测过。这组指标就是用来回答这个问题的;如果审核队列持续积压或 judged-used 没有改善,第 3 阶段不应该
对客户默认开启。

## 9. 存量迁移与回滚

按问题 5 的推荐方案:

1. **不动数据。** 现有 `memories` 行保持原样。第 2 阶段起,投递集合是「已批准的 judgment」加「ACTIVE 的
   遗留项目级和里程碑级记忆」;遗留的在索引行和卡片上标「未审核」。
2. **逐条转换。** 记忆页每条遗留记忆有「转成候选」:按 6.4 的映射预填一条 PROPOSED 修订,
   `captureMethod = MIGRATED`,`origin` 按 `createdByMemberId` 是否为空预填 UNKNOWN(因为第 1 节的标注问题,
   有成员 id 也不能证明是人写的),`legacyMemoryId` 指回原行。审核人补全理由和适用条件后批准。
3. **批准时交接。** 批准事务里把对应的遗留记忆置为 ARCHIVED(已有状态,可恢复),避免同一内容投递两份。
   驳回不改遗留记忆;要让它停止投递,用现有的退役动作。
4. **批量转换。** 按分类或按 judged-used 排序批量生成候选;映射是确定性的,不调用模型。
5. **停用日期。** OWNER 可以给本工作区设一个日期,之后未转换的遗留记忆不再投递(仍保留,可继续转换)。
   默认不设。Lumo 自己的工作区建议在转换完 66 条后立刻设。

回滚:

- 第 4 阶段任何时候关掉开关,投递回到只看 `memories`。已被批准交接而归档的遗留记忆需要恢复:修订表里有
  `legacyMemoryId` 可查,提供一个脚本按它把 ARCHIVED 改回 ACTIVE。这个脚本属于第 4 阶段的交付物,
  上线前在开发库上演练一次。
- 全程不删除 `memories` 行,不删除 `prisma/migrations/` 里的文件。
- `MemoryCategory`、`MemoryStatus`、`MemoryScope` 的枚举值在第 5 阶段之前都不动。

**未核实的数量。** 生产库和其他工作区有多少条记忆、各分类多少,本次没有查(本机没有可用的生产只读凭证)。
在定停用日期的默认值和批量转换的批大小之前需要这组数,建议由所有者在自己的终端跑一个只读计数脚本。

## 10. 留给实现者

- 字段级 schema 以第 4 节为准;规范化内容并计算 `digest` 的函数要有固定的字段顺序和测试向量。
- 抽一个「必须是人类 Web 会话」的共用检查,替换现有各处内联的 `identity.source !== 'clerk'`。
- 对客文案走 react-intl,所有 locale 文件一起更新;文案里不出现其他产品的名字。
- `lumo memory show` 现在按 id 读取时不过滤状态(`lib/repositories/memory.repository.ts:476`),judgment 的
  读取要默认只返回生效修订,看历史修订需要显式参数。
- 本文没有覆盖:导入导出格式、依赖关系(`depends_on`)、可选的模型辅助审核。它们都可以在第 2 阶段之后
  单独提出。
