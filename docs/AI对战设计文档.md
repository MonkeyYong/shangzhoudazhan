# 《商周大战》AI 对战 · 设计文档

> 本文档是 `codes/商周大战.html` 中「AI 引擎」section 的权威设计说明。游戏规则以 `docs/《商周大战》棋类游戏规则说明书.txt` 及 `docs/设计文档.md` 为准。

---

## 一、背景与需求

游戏首版仅支持本地双人热座对弈（见主设计文档 §一）。AI 对战为后续增量功能，需求已确认：

1. **执子方任选**：保留双人对弈，可选 AI 执黑或 AI 执白（执白即 AI 先手）。
2. **难度三档**：菜鸟、高手、大师。
3. **AI 自主决策**：包括"是否分身"在内的全部策略由 AI 自主决定——分身作为搜索树的分支，由评估函数选择，不硬编码任何策略。

## 二、核心架构决定：独立模拟器 sim

搜索引擎**不触碰全局状态**，建立独立模拟器 `sim`，规则函数逐一翻版自「规则层 / 行动执行」，命名 `sim*`。

**理由**：
- **性能**：全局 `pieceAt` 是线性扫描（O(P)），搜索内每节点退化 O(P²)；`snapshot()` 还含 `moveLog.slice()`/`positionCounts` 拷贝，数十万节点下浪费大。sim 用 `Int16Array(361)` 占用表实现 O(1) 查子。
- **异常安全**：全局规则层与 `stepCount`/`positionCounts`/`cloneCandidates` 等 UI 态耦合，"保存/恢复全局状态"需枚举完整清单，易漏；sim 天然隔离，无需 try/finally。

**代价与约束**：规则代码双份（`sim*` 约 200 行）。项目规则由规则书锁定、已稳定。**硬约束：修改任何规则（`reachableCells`/`legalMoves`/`isImprisoned`/`recomputeKingStates`/`berserkCheck`/`activeUnlockCheck`/`cloneOfferCheck`/`doMove`/`settleMove`/`checkWinLoss`/`hasAnyMove`）时，必须同步修改对应 `sim*` 函数。** 每个 `sim*` 头部注释互指原函数。

### sim 数据结构

```js
sim = {
  occ: Int16Array(361),   // occ[r*19+c] = pieces 下标；-1 = 空
  pieces: [...],          // 棋子对象克隆：{idx, id, side, type, col, row, state,
                          //                 isClone, hasMoved, activelyUnlocked, dead}
  turn,                   // 轮走方
  lostClone:    { white, black },  // → 全局 sideLostClone
  cloneUnlocked:{ white, black },  // → 全局 sideCloneUnlocked
}
```

- 被吃子标记 `dead = true`，不移出数组 → 下标稳定，着法可用 `idx` 引用棋子，`simClone` 无需重建索引。
- `simClone` = `occ.slice()` + 逐子 `{...p}` 浅拷贝 + 两个标志对象拷贝。

### sim* ↔ 原函数对照

| sim 函数 | 翻版自 | 说明 |
|---|---|---|
| `makeSim` | — | 从全局局面构建 sim |
| `simAt` | `pieceAt` | O(1) 查子（占用表 + dead 判定） |
| `simGenMoves` | `reachableCells` + `legalMoves` | 内联方向扫描，零中间数组；规则等价：不穿敌、吃敌后停、穿己方、不吃无敌王 |
| `simHasReach` | `reachableCells` | 零分配短路版（仅判"有无可达格"），评估机动性用；容忍"吃无敌王"过滤的极小误差 |
| `simHasAnyMove` | `hasAnyMove` | 零分配短路版，严格处理"唯一着法为吃无敌王" |
| `simInTheoryRange` | `theoreticalRange` | 几何判定替代字符串 Set：非暴走=切比雪夫距离≤2；暴走=8 方向射线 |
| `simCanAttack` | `isImprisoned`（覆盖统计） | 零分配、命中即停；禁锢统计与评估共用 |
| `simCoverage` | `isImprisoned`（计数） | 基于 `simCanAttack` |
| `simKingStates` | `recomputeKingStates` | 同 |
| `simBerserkCheck` | `berserkCheck` | 含"对方武王解除无敌"副作用 |
| `simFirstCloneCand` | `cloneOfferCheck` + `settleMove` 取候选 | 首个可转化士兵，与全局 `cloneCandidates[0]` 顺序一致 |
| `simCloneOffered` | `cloneOfferCheck` | 仅返回 bool，不写全局候选 |
| `simDoMove` | `doMove` + `activeUnlockCheck` | 含暴走、主动解锁、分身提示、被动重算 |
| `simWinner` | `checkWinLoss` | 返回胜方或 null |
| `simSettle` | `settleMove` | 分身转化 → 胜负 → 换边 → 停棋负；**不保留三次重复平局**（见 §五） |

## 三、搜索算法

`negamax` + alpha-beta，辅以标准竞技象棋剪枝技术（均为朴素实现，未做置换表/killer 等）：

1. **MVV-LVA 着法排序**（`simSortMoves`）：吃子着法最前（按被吃子价值降序：king 2000 > clone 350 > soldier 100），静默着法按 history 启发降序。
2. **history 启发式**（`aiHistory`）：`Int32Array(361*361)`，引发 β 截断的着法累加 `depth²`；每次 `aiChooseMove` 重置。
3. **LMR（延迟着法裁剪）**：`depth ≥ 3` 且序号 `≥ 4` 的静默着法先减一层搜索；若可能抬高 α 再全深度重搜。
4. **RFP（静态空着裁剪）**：`depth ≤ 2 && ply > 2` 时，静态评估 − 300×depth ≥ β → 直接返回静态评估。
5. **叶前裁剪（futility）**：`depth === 1` 的静默着法，静态评估 + 300 ≤ α → 跳过；全被跳过则返回静态评估。
6. **静态搜索（qsearch）**：主搜索叶节点（`depth ≤ 0`）接入只含吃子着法的静态搜索至安静局面，消除水平线效应——保证吃子链（含多步互吃）算清，这是战术棋力的关键。含：stand pat、delta 裁剪（吃子收益上限够不到 α 则跳过）、MVV-LVA 排序、内部层数硬上限 4（与主搜深度无关，独立计数）。
7. **根节点滑动 α 窗**：首着全窗，后续着法用 `[α, +∞)` 窄窗快速 fail-low。clone 两分支同样传递收窄窗口（`max(α, s₁)`）。**每个根着记录 `exact` 标志**（score 抬高 α 才是真值，否则为 fail-low 上界）：高手/大师的「同分随机」仅在真值着法集合内选择——fail-low 上界造成的"伪同分"不得入池，否则浅层回退时会退化为随机选着。
8. **迭代加深**（高手/大师档）：深度 1→maxDepth 逐层推进，上一层结果作为下一层排序依据；`timeLimitMs` 软限，超时抛 `AI_TIMEOUT` 哨兵，**保留最近一个完整层的结果**（不完整层丢弃）。复杂中局深度自然回退、由静态搜索补偿战术视野，属预期行为。
9. **置换表（TT）**：Zobrist 哈希（mulberry32 固定种子；每格×72 种棋子状态一对 32 位随机数，回合方与分身标志位另有独立随机数），双 32 位键防碰撞；`2^18` 槽位结构化数组存储（深度/分值/flag/best 着法编码）。非根节点先探测：命中且存储深度 ≥ 剩余深度时按 flag（exact / lower / upper）直接返回；未命中也取出 best 着法置于排序最前（PV 排序）。搜索完成后写回（杀局分值 ±(AI_M−ply) 与 ply 相关，不存）。**TT 表跨迭代层与跨着保留**——迭代加深因此获得上层 PV 排序，是本引擎深度提升的最大杠杆（实测中局有效深度 +2 层）。
10. **killer 启发**：每 ply 记录 2 个引发 β 截断的静默着法，排序位于吃子着之后、history 之前；每次选着重置。

**分身分支展开**：某着执行后若触发分身提示（`res.offered`），搜索内展开 clone=true / clone=false 两个子节点取优——实现"AI 自主决定分身"。全局执行时 `settleMove` 的 `cloneDecision` 取搜索结论；转化目标固定 `cloneCandidates[0]`，与 `simFirstCloneCand` 顺序一致。

**终局分值**：±(1,000,000 − ply)，速胜/缓败偏好内建；评估值域远小于该基数。

## 四、评估函数 `simEval`

返回 `side` 视角分值（双方子项相减），值域 ≪ 1,000,000：

| 维度 | 分值 | 理由 |
|---|---|---|
| soldier | 100 | 基准；唯一能围王/变分身/破围的子 |
| clone | 350 | 规则上等同武王，须击杀才算灭王 |
| king 本体（基础值） | 1500 | 王亡 = 决定性，由子力差表达 |
| king 禁锢 | −500 | 停摆 + 灭子判负风险，最差状态 |
| king 已解锁（!hasMoved 且非禁锢） | +200 | 解锁价值：可立即行棋 + 首动解锁分身 |
| 王脆弱项：可杀的王（hasMoved） | ±300 | 对方王可杀 +300、己方王可杀 −300。刻意小于暴走加分：使「暴走解禁对方王」净收益为正（鼓励攻王），但不夸大「可杀」价值（可杀 ≠ 将杀，且对方王自由后同时获得机动与反扑） |
| 灭子判负风险 | −(3−兵数)×150（对方对称 +） | 己王禁锢且兵 ≤2 时，距「禁锢+兵全灭=判负」一步之遥 |
| 己方暴走子 | +400 | 2 格 → 无限射线，且强制解除对方王无敌 = 攻王窗口 |
| 分身能力期权（已解锁、未暴走、big<2、有兵） | +120 | 转化机会 ≈ 多一个 350 分大子 |
| 机动性（有可达格的棋子数差） | ×2 | 轻量项 |
| 己兵 → 对方王 切比雪夫距离 d | +max(0, 12−d)×5 | 围王潜力；开局王兵距离 10+ 格，作用域放宽至 12 |
| 对方王被覆盖数 n | +n×50 | 直接逼近禁锢（≥2 即禁锢） |
| 救王/解锁梯度：禁锢中己王 → 最近己兵距离 d | +max(0, 12−d)×6；d≤2 再 +100 | **解除己王禁锢是判胜的必要条件**（杀光对方王但己王未解锁不判胜），故给高权重；兵入解锁范围 = 下一步即可解锁，重赏 |

首版不做王城距离分、兵形、中心控制；实测棋力不足时再补。

> 历史教训：①早期版本把「可杀王 vs 无敌王」的差值（+1000）计入持有方资产，导致「暴走解禁对方王」在评估中净亏约 −790，AI 系统性回避一切攻王手段。修复为对称脆弱项后攻王行为恢复正常。②早期围王/救王距离项作用域仅 8 格，开局王兵相距 10+ 格时所有距离项归零，AI 开局失去战略方向（走"占中心观望"等着）；放宽至 12 格并提高解锁梯度权重后，开局着法转向解王竞赛与围王施压。

## 五、难度档位与实测性能

| 档 | 最大深度 | 随机性 | 迭代加深软限 | 实测单步耗时（开发机） |
|---|---|---|---|---|
| 菜鸟 rookie | 1 | top-4 随机（出现吃子着放宽至 top-8，少瞎送） | 无 | ~10ms |
| 高手 advanced | 4 | 同分真值着法随机择一 | 2500ms | 开局 ~2.4s（完整 depth 4）；中局多数 depth 4（1.6-2.5s） |
| 大师 master | 5 | 同分真值着法随机择一 | 4500ms | depth 4 稳定 + 常部分完成 depth 5（~4.5s） |

所有档位叶节点均接静态搜索（吃子链精算），菜鸟的深度 1 + 静态搜索也已具备基本吃子计算能力。高手/大师在复杂中局（子力活跃、分支因子高）深度回退到 2-3 层是限时迭代加深的预期行为，静态搜索补偿了战术视野；开局/残局子力受限时可搜至最大深度。

「同分随机」仅限真值着法（根节点 score 抬高了 α 的着法），用于打破对称局面下的固定循环（否则同级对弈易走入重复局面判和）并增加对局变化；fail-low 上界造成的"伪同分"不参与随机——早期版本未加此约束，浅层回退时曾退化为随机选着。

分支因子典型 60–120（斜 2 格田字步 + 可穿己方使目标格偏多）。大师档在慢机器上可能超时回退到 depth 3 结果——这是迭代加深的预期行为，仍强于高手档。

调试输出：每次选着在 console 打印 `[AI] level=… depth=完成/目标 nodes=… time=…ms score=…`。

**搜索内平局近似**：不建 `positionCounts`，搜索不感知三次重复平局；±(M−ply) 终局分值使 AI 天然拒绝循环（重复走位不产生收益，循环中的吃亏着会被惩罚）。实战平局仍由人类/AI 共用的全局 `settleMove` 判定，AI 走出重复局面时照常判平。

## 六、走子管线与挂点

AI 落子**绕过 `finishTurn`**（其 `confirm()` 分身弹窗阻塞，AI 不可走），仿人类落子链 + `applyRecord` 模式：

```
aiMaybeSchedule()                    // 守卫 + 令牌 + setTimeout(30ms)
  → aiChooseMove(side, cfg)          // 纯 sim 搜索，不动全局
  → aiPlayMove(mv)                   // 唯一改全局处：
      pushHistory()                  //   悔棋快照（与人类同构）
      doMove(piece, toCol, toRow)
      render()
      settleMove(piece, res, mv.clone)
      moveLog.push(buildRecord(...)) //   记谱与人类完全同构
      render(); renderScoresheet()
      announce(term)                 //   终局提示
```

**调度挂点（3 处调用 `aiMaybeSchedule`）**：
1. `finishTurn` 非终局分支末尾——人类落子结算完，轮到 AI；
2. `newGame` 末尾——AI 执白首步（custom 空局摆子分支提前 return，天然不触发）；
3. `startFromSetup` 末尾——摆子开局后 AI 先手。

**令牌失效点（`aiToken++`）**：`newGame`、`undo`、`redo`、`startReplay`、`enterSetup` 入口。`aiMaybeSchedule` 自增令牌并记录，定时器回调首行复核令牌 + 重查守卫（`turn === aiSide && !gameOver && !replayMode && !studyMode && !setupMode`），任一不满足即放弃——覆盖"30ms 窗口内用户点新局/悔棋/切档位/进复盘"的全部竞态。`aiBusy` 防重入，`finally` 保证复位。

**交互守卫**：canvas click handler 与 hover 判定均排除 `aiBusy || (aiSide && turn === aiSide)`——AI 回合人类不可选子（否则 `p.side === turn` 会让 AI 的棋子被选中）。

## 七、悔棋 / 撤销悔棋语义

- **双人模式**：一次一手（原行为不变）。
- **AI 模式，AI 已应着**（轮到人类）：一次连撤两手（AI 着 + 人类着），撤销悔棋对称连复两手。
- **AI 模式，AI 尚未应着**（AI 回合中）：只撤人类上一步；已排队的 AI 思考被令牌作废，不再落子。
- **终局特例**：终局时 `turn` 指向收束方（胜方）而非轮走方，故条件为 `turn !== aiSide || gameOver`——AI 获胜后人类悔棋也连撤两手，回到人类可重新行棋的状态，而非让 AI 立即重走。
- 连撤中间态安全：第一次 undo/redo 尾部触发的 `aiMaybeSchedule` 定时器，会被第二次的 `aiToken++` 作废（两者同步连续执行）。

## 八、UI

「开局」section 内档位下拉之后新增两个主题化下拉（复用 `.cdd` 样式与泛化后的 `makeDropdown(ddId)`——原 `setupPresetDropdown` IIFE 泛化而来，preset 下拉迁移使用，行为不变）：

- **对手**：双人对弈（默认）/ AI 执黑（人先手）/ AI 执白（AI 先手）。切换 → 写 `aiSide` → `newGame()`。
- **难度**：菜鸟 / 高手（默认）/ 大师。切换即时生效（仅影响下一次 AI 思考）；双人模式下禁用（`.is-disabled`）。

AI 思考期间 `#hint` 显示「AI 思考中…」（`setTimeout` 30ms 让提示先上屏；同步长考冻结 hover 动画，可接受——思考中本就该静止）。

## 九、模式隔离

AI 调度守卫排除 `replayMode`/`studyMode`/`setupMode`/`gameOver`：复盘、研究、摆子模式下 AI 一律不触发；研究态人类行棋走 `finishTurn`，其尾部 `aiMaybeSchedule` 被 `studyMode` 守卫拦下。

## 十、验证

### 自动化（`.claude/ai-smoke-test.js`，node + DOM stub）

- `simGenMoves` 与全局 `legalMoves` 逐子目标集合完全一致；
- `simCanAttack` 与全局 `reachableCells` 对王格覆盖判定完全一致；
- 三档难度在初始局面均选出合法着法；
- AI 完整自对弈至终局（不崩、棋谱每步入账、终局自洽）；
- 悔棋双语义（AI 模式连撤两手 / 双人模式一手）；
- 完整棋谱可经 `applyRecord` 链路无中断重放。

运行：`node .claude/ai-smoke-test.js`（自对弈约数分钟）。

### 棋力诊断（`.claude/ai-diag.js`）

8 个典型局面下各档 AI 的着法观察：白吃一兵（2 格/邻格）、交换判断、白吃大子（分身）、远距离调动、开局首步倾向、救王 vs 吃子取舍、三着吃子链（静态搜索鉴别题）。所有局面均含**真实围困**（双方武王各被 2 枚敌兵禁锢）——构造战术测试局面时务必保证围困真实，否则"王无围困→自由→入宫暴走"会成为局面的主导因素，掩盖战术行为（AI 回避吃子可能恰恰是正确应对暴走威胁）。

运行：`node .claude/ai-diag.js`。预期：高手/大师在 1-4、7、8 号局面均主动吃子/入链，开局走子向中心/敌阵展开。

### 手工验证清单（浏览器双击 index.html）

1. **双人回归**：默认双人完整走一局（移动/吃子/分身弹窗/暴走/胜负/悔棋/复盘/研究/摆子/导入导出），确认无行为变化。
2. **AI 执黑**：人类白方落子 → hint「AI 思考中…」→ AI 合法应着（不穿敌、不吃无敌王）；棋谱正常；AI 触发分身时自主决定且棋谱含「分身」事件。
3. **AI 执白首步**：新局后 AI 自动先走。
4. **三档难度**：菜鸟偶尔闲着（随机性），高手/大师稳定吃子解王；大师档思考 ≤2.5s（console 核对 depth/nodes/time）。
5. **悔棋**：AI 模式一次撤销两手；redo 对称；AI 执白首步后悔棋 → AI 重走首步。
6. **竞态**：AI 思考提示出现的瞬间快速点新局/悔棋/切档位 → 无误落子、不弹 confirm、局面自洽。
7. **模式隔离**：AI 对局中进复盘/研究/摆子 → AI 不触发；研究态走子不调度 AI。
8. **终局**：击杀 AI 全部武王 / 造停棋 → 正常判胜且 AI 不再调度；AI 将死人类 → announce 正常；AI 胜后人类悔棋 → 连撤两手回到人类回合。

## 十一、不做（简单优先）

开局库、残局表、置换表、killer 启发、静态交换搜索（SEE）、联网对战、AI 强度自学习。棋力不足时优先调整 §四 评估分值与 §五 深度参数，而非堆叠搜索复杂度。
