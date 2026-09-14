/**
 * change-package —— 变更包多角色编排通用模板
 *
 * 流程：立项(plan) → 设计(design) → 任务拆解(tasks) → 实施(implement) → 验证(verify) → 门禁(gate)
 *
 * 配套规范：spec-change-flow（变更流程）、ai-collab-guardrails（护栏与 TEST_REPORT）、
 *           dev-conventions（命名与提交）、workflow-authoring（本模板的编写规范）。
 *
 * 使用方式：
 *   1. 复制到项目 .claude/workflows/change-package.js；
 *   2. 按项目实际调整 COMMON（唯一源目录/术语/既有文档风格）、TRACKS 默认值、ROLE_EFFORT；
 *   3. 逐阶段执行（stage=plan → 人工确认 → stage=design → …）以兑现冻结点；
 *      stage=all 顺序跑完全部，仅适用于标准级、主 agent 可判断冻结的场景。
 *
 * 机制要点：
 *   - 「冻结」是流程纪律而非技术锁：脚本内 `⏸ 冻结点` 只是日志提示，stage=all 不会真停；
 *     重大级变更必须逐阶段执行 + 人工确认。
 *   - 子 agent 会加载项目 CLAUDE.md：角色职责、编号规范等通用约束不必写进提示词，
 *     COMMON 只补 CLAUDE.md 没有的项目特有上下文。
 *   - 断点续跑：Workflow({scriptPath, resumeFromRunId}) 恢复时按 (prompt, opts) 哈希命中缓存，
 *     prompt 一字不改的已完成调用秒回；重跑阶段请传 args.resume 注入断点情报，
 *     并对恢复前产出的验证类结论独立复验，不盲信缓存回收的结果。
 *
 * args: {
 *   slug: string,        // 必需，变更包目录名（小写中划线），如 "portal-runtime-config"
 *   title: string,       // 必需，变更标题
 *   brief?: string,      // 需求背景/范围简述（plan 阶段必需）
 *   stage?: "plan" | "design" | "tasks" | "implement" | "verify" | "gate" | "all",  // 默认 all
 *   tracks?: string[],   // 实施/验证轨道（多轨并行扇出），如 ["backend","frontend"]；默认单轨
 *   resume?: string,     // 断点续跑情报（已完成面/缺口/注意事项），注入所有角色提示词
 *   effort?: "low" | "medium" | "high" | "xhigh" | "max",  // 覆盖所有角色，默认按 ROLE_EFFORT 分层
 * }
 */

export const meta = {
  name: 'change-package',
  description: '变更包多角色编排：立项/设计/任务拆解/实施/验证/门禁 分阶段执行',
  phases: [
    { title: 'Plan', detail: '产品分析师：analysis.md + prd.md' },
    { title: 'Design', detail: '架构师 design.md ∥ 测试工程师 tests.md 策略 → 合规预审' },
    { title: 'Tasks', detail: '协调员：tasks.md 按角色拆解（编号 TASKS-*-001）' },
    { title: 'Implement', detail: '开发工程师(代码+单测+埋点) 按轨扇出 ∥ 运维工程师(deploy)' },
    { title: 'Verify', detail: '测试工程师按轨验证：集成/E2E + TEST_REPORT.md' },
    { title: 'Gate', detail: '质量合规审查员终审 + tasks.md 状态收敛' },
  ],
}

// args 兼容：harness 在部分调用场景下以 JSON 字符串而非对象传入，统一归一化
const ARGS = typeof args === 'string' ? JSON.parse(args) : args

const DOC_DIR = `docs/changes/${ARGS.slug}`

// 实施/验证轨道：多轨（如前后端双仓）时各自扇出开发与验证 agent，默认单轨
const TRACKS = Array.isArray(ARGS.tracks) && ARGS.tracks.length ? ARGS.tracks : ['app']

// 角色 → 推理强度分层：重代码/重审查角色用高强度，不依赖 harness 默认模型路由
// （默认路由可能把重活发给轻量模型，留下「写了没接线」类缺口）。
// 如需按模型分层，在下方 agent() 调用的 opts 里显式加 model 字段。
const ROLE_EFFORT = {
  产品分析师: 'medium',
  架构师: 'high',
  测试工程师: 'medium',
  协调员: 'medium',
  开发工程师: 'high',
  运维工程师: 'medium',
  质量合规审查员: 'high',
}

// 将 ROLE_EFFORT 分层（或 args.effort 统一覆盖）合入 agent() opts；为空则不传
function withEffort(role, opts) {
  const effort = ARGS.effort || ROLE_EFFORT[role]
  return effort ? { ...opts, effort } : opts
}

const COMMON = [
  `项目遵循规范驱动开发流程，变更包目录为 ${DOC_DIR}/（唯一源）。`,
  `编号规范：FR-/NFR-/GR-/API-/US-/AC-/TC-UT-/TC-IT-/TC-E2E-。`,
  `文档用中文撰写，风格对齐本仓库既有变更包（如有）。`,
  `你的最终回复是给协调员的原始数据，不是给人看的消息：直接输出结构化结论。`,
].join('\n')

// 断点续跑情报：恢复运行时由 args.resume 传入，提醒角色先盘点现状、只补缺口
const RESUME_NOTE = ARGS.resume
  ? `\n【断点续跑】${ARGS.resume}\n工作树/文档可能已含部分产出：先盘点现状，只补缺口，不重做已完成工作。`
  : ''

const DOC_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' }, description: '产出/修改的文件路径' },
    summary: { type: 'string', description: '本阶段产出要点，供下游阶段与冻结确认使用' },
    openQuestions: { type: 'array', items: { type: 'string' }, description: '需人类/下游确认的开放问题' },
  },
  required: ['files', 'summary', 'openQuestions'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'consistency | security | quality' },
          detail: { type: 'string' },
          owner: { type: 'string', description: '回写责任角色' },
        },
        required: ['kind', 'detail', 'owner'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['pass', 'issues', 'summary'],
}

async function stagePlan() {
  phase('Plan')
  log(`立项阶段：${ARGS.title}（${DOC_DIR}）`)
  const r = await agent(
    `你是【产品分析师】。为变更「${ARGS.title}」建立变更包。\n` +
    `需求背景：${ARGS.brief}\n\n` +
    `职责：产出 ${DOC_DIR}/analysis.md（方案分析，编号 ANALYSIS-*-001）与 ${DOC_DIR}/prd.md` +
    `（产品需求，含 FR/NFR/US/AC，编号 PRD-*-001）。只做业务问题定义、范围边界与验收条件，` +
    `不写技术方案细节。\n${COMMON}`,
    withEffort('产品分析师', { label: '产品分析师', phase: 'Plan', schema: DOC_SCHEMA }),
  )
  log('⏸ 冻结点：请确认 prd（analysis+prd 已产出）后再进入 Design 阶段')
  return r
}

async function stageDesign() {
  phase('Design')
  log('设计阶段：架构师与测试工程师并行，合规预审兜底')
  const [design, testStrategy] = await parallel([
    () => agent(
      `你是【架构师】。基于已冻结的 ${DOC_DIR}/analysis.md 与 ${DOC_DIR}/prd.md，\n` +
      `产出 ${DOC_DIR}/design.md（SPEC + 设计，编号 DESIGN-*-001）。\n` +
      `必含：技术方案、接口规范（API-）、数据模型、依赖与风险、**指标清单**` +
      `（SLI/SLO、指标名称/类型/标签、告警阈值——必填节，无指标需求也须显式说明）。\n` +
      `须逐条回写 prd 中的 AC 如何在设计中被满足。\n${COMMON}`,
      withEffort('架构师', { label: '架构师', phase: 'Design', schema: DOC_SCHEMA }),
    ),
    () => agent(
      `你是【测试工程师】。基于 ${DOC_DIR}/analysis.md 与 ${DOC_DIR}/prd.md，\n` +
      `起草 ${DOC_DIR}/tests.md 测试策略部分（编号 TST-*-001）：测试范围、分层策略` +
      `（UT/IT/E2E/SMOKE）、AC -> 测试用例的映射骨架。用例细化可在 design 完成后补。\n${COMMON}`,
      withEffort('测试工程师', { label: '测试工程师', phase: 'Design', schema: DOC_SCHEMA }),
    ),
  ])
  const pre = await agent(
    `你是【质量合规审查员】，执行 design 冻结前预审。\n` +
    `审查 ${DOC_DIR}/ 下的 analysis/prd/design/tests：\n` +
    `1) 编号连续无重复；2) 术语与项目 CLAUDE.md 术语表一致；3) design 是否覆盖 prd 全部 AC、\n` +
    `   是否含指标清单；4) 安全合规初筛（密钥不落盘、权限/CORS/脱敏是否被设计考虑）。\n` +
    `只报告问题，不直接改文档。\n${COMMON}`,
    withEffort('质量合规审查员', { label: '合规预审', phase: 'Design', schema: GATE_SCHEMA }),
  )
  log(`⏸ 冻结点：请确认 design（预审 ${pre && pre.pass ? '通过' : '发现问题'}）后再进入 Tasks 阶段`)
  return { design, testStrategy, preReview: pre }
}

// 置于 Design 之后：开发/运维任务拆解依赖 design 产出；tasks.md 是冻结的组成部分
async function stageTasks() {
  phase('Tasks')
  const r = await agent(
    `你是【协调员】。基于已冻结的 ${DOC_DIR}/prd.md 与 ${DOC_DIR}/design.md，\n` +
    `生成 ${DOC_DIR}/tasks.md（编号 TASKS-*-001）：按角色拆解任务项` +
    `（产品/架构/开发${TRACKS.length > 1 ? `（分轨：${TRACKS.join('/')}）` : ''}/运维/测试/合规），\n` +
    `每项带状态标记（⬜/🚧/✅/⛔）与验收依据（关联 FR-/AC-/TC- 编号）。只生成任务清单，不改其他文档。\n${COMMON}`,
    withEffort('协调员', { label: '协调员', phase: 'Tasks', schema: DOC_SCHEMA }),
  )
  log('⏸ 冻结点：tasks.md 已生成，确认任务拆解后进入 Implement 阶段')
  return r
}

async function stageImplement() {
  phase('Implement')
  log(`实施阶段：开发按轨扇出（${TRACKS.join('/')}）∥ 运维并行`)
  const jobs = TRACKS.map((t) => () =>
    agent(
      `你是【开发工程师】${TRACKS.length > 1 ? `（负责 ${t} 轨）` : ''}。` +
      `严格按已冻结的 ${DOC_DIR}/prd.md 与 ${DOC_DIR}/design.md 实现代码，\n` +
      `并编写对应单元测试；按 design 指标清单完成埋点。\n` +
      `约束：不得偏离冻结设计；实现导致设计变化时停止并在 openQuestions 中说明，由协调员回写文档后再继续。\n` +
      `完成后运行相关单测，更新 ${DOC_DIR}/tasks.md 中本轨开发项状态（只改 ✅/🚧，不动其他角色条目）。\n` +
      `${COMMON}${RESUME_NOTE}`,
      withEffort('开发工程师', {
        label: TRACKS.length > 1 ? `开发:${t}` : '开发工程师',
        phase: 'Implement',
        schema: DOC_SCHEMA,
      }),
    ),
  )
  jobs.push(() =>
    agent(
      `你是【运维工程师】。按 ${DOC_DIR}/design.md 完成部署侧工作：\n` +
      `deploy/、Dockerfile、编排与配置中心、监控部署（告警规则/面板等，按项目实际）。\n` +
      `只动部署与配置，不改业务源码；更新 ${DOC_DIR}/tasks.md 中运维项状态。\n` +
      `若集群/环境不可用导致无法验证，将对应任务标注 ⛔ 并注明原因与 Owner。\n${COMMON}${RESUME_NOTE}`,
      withEffort('运维工程师', { label: '运维工程师', phase: 'Implement', schema: DOC_SCHEMA }),
    ),
  )
  const results = await parallel(jobs)
  return { dev: results.slice(0, TRACKS.length), ops: results[TRACKS.length] }
}

async function stageVerify() {
  phase('Verify')
  const jobs = TRACKS.map((t) => () =>
    agent(
      `你是【测试工程师】${TRACKS.length > 1 ? `（负责 ${t} 轨）` : ''}。基于 ${DOC_DIR}/tests.md 执行验证：\n` +
      `运行集成/E2E 测试（环境不可用的项标注阻塞原因而非跳过），补全用例实现。\n` +
      `按 design 逐条核对实现可达性（调用点已接线、文案 key 齐全、入口可达），而非仅看文件存在。\n` +
      `生成/更新对应模块的 TEST_REPORT.md（执行时间、总数/通过/失败/跳过、覆盖率、<80% 模块清单、\n` +
      `失败摘要与责任人；覆盖率运行须以全量跑收尾，避免子集运行污染权威数字）。\n` +
      `更新 ${DOC_DIR}/tasks.md 中测试项状态。\n${COMMON}${RESUME_NOTE}`,
      withEffort('测试工程师', {
        label: TRACKS.length > 1 ? `测试:${t}` : '测试工程师',
        phase: 'Verify',
        schema: DOC_SCHEMA,
      }),
    ),
  )
  return await parallel(jobs)
}

async function stageGate() {
  phase('Gate')
  const r = await agent(
    `你是【质量合规审查员】，执行合并前终审。\n` +
    `审查范围：${DOC_DIR}/ 全套文档 + 本次变更代码 + 部署配置。\n` +
    `1) 文档一致性：编号、术语、跨文档回写（系统级文档、CLAUDE.md、docs 索引）；\n` +
    `2) 安全合规：密钥不落盘/不进热更新、权限与 CORS 配置、日志脱敏；\n` +
    `3) 质量门禁：TEST_REPORT.md 已更新、覆盖率达标、⛔ 阻塞项有 Owner 与原因、\n` +
    `   design 指标清单均已埋点并部署；\n` +
    `4) tasks.md 状态与实际产出一致。\n` +
    `发现问题只报告并指派回写角色，不直接改。pass=false 时不得合并。\n${COMMON}`,
    withEffort('质量合规审查员', { label: '质量合规审查员', phase: 'Gate', schema: GATE_SCHEMA }),
  )
  if (r) log(r.pass ? '✅ 终审通过，可提交合并' : `❌ 终审未通过：${r.issues.length} 个问题待回写`)
  return r
}

const STAGES = {
  plan: stagePlan,
  design: stageDesign,
  tasks: stageTasks,
  implement: stageImplement,
  verify: stageVerify,
  gate: stageGate,
}

if (!ARGS.slug || !ARGS.title) {
  throw new Error('change-package 需要 args.slug 与 args.title')
}

const stage = ARGS.stage || 'all'
if ((stage === 'all' || stage === 'plan') && !ARGS.brief) {
  throw new Error(`stage=${stage} 需要 args.brief（plan 阶段必需）`)
}

if (stage === 'all') {
  const results = {}
  for (const [name, fn] of Object.entries(STAGES)) {
    results[name] = await fn()
    if (name === 'gate' && results.gate && !results.gate.pass) break
  }
  return results
}
const fn = STAGES[stage]
if (!fn) throw new Error(`未知 stage: ${stage}（可选 ${Object.keys(STAGES).join('/')}/all）`)
return await fn()
