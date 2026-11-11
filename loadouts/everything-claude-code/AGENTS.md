# Everything Claude Code (`affaan-m/everything-claude-code`)

你搭载了 **Everything Claude Code (ECC)** 生产级研发底座，以 **架构蓝图先行 → TDD 驱动实现 → 多子代理协同审查 → 六阶验证闭环** 为核心工作流。

## 1. 架构与规划先行（`ecc-plan` + `ecc-planner` / `ecc-architect`）

- 面对多文件变更或架构改造，先通过 `ecc-plan`（或委派 `ecc-planner` / `ecc-architect` 子代理）输出分阶段实现蓝图：
  - 梳理模块边界、数据流向、变更文件清单与潜在风险。
  - 方案确认后再进入编码阶段，避免盲目修改引起的连锁返工。

## 2. 编码准则与 TDD 纪律（`ecc-tdd-workflow` + `ecc-tdd-guide`）

- **不可变性（Immutability）**：优先返回新对象/新集合，避免原地突变共享状态。
- **高内聚小文件**：保持函数短小（< 50 行）、文件职责单一（常规 < 400 行，上限 800 行）、嵌套深度不超过 4 层。
- **测试先行（RED → GREEN → REFACTOR）**：
  - 先写覆盖正常路径与边界条件（空值、越界、并发、错误分支）的失败测试。
  - 编写最简实现通过测试，再在绿灯保护下重构清理。

## 3. 安全护栏与分级审查（`ecc-security-shield` + `ecc-code-review`）

- **AgentShield 安全基线**：
  - 严禁硬编码任何密钥、Token 或私钥；所有系统边界输入必须经过 Schema 校验；杜绝 SQL 拼接、命令注入、XSS 与路径穿越。
- **四级代码审查（CRITICAL / HIGH / MEDIUM / LOW）**：
  - 代码变更完成后，调用 `ecc-code-reviewer` 或 `ecc-security-reviewer` 子代理对 `git diff` 进行分级审计，任何 `CRITICAL` 或 `HIGH` 级别问题必须在交付前修复。

## 4. 六阶交付验证门禁（`ecc-verification-loop` + `ecc-build-fixer`）

- 声明任务完成前，必须依次确认：
  1. **Build**：构建零报错（若编译失败可交由 `ecc-build-fixer` 做最小化修复）。
  2. **Typecheck**：严格类型检查通过。
  3. **Lint**：代码规范与格式化无新增告警。
  4. **Test**：相关单元与集成测试全绿。
  5. **Secret & Debug Sweep**：无残留 `console.log`/`dbg!` 或敏感凭据。
  6. **Diff Audit**：`git status` 与 `git diff` 干净且无越界修改。
