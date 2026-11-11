# Matt Pocock Engineering Workflow (`mattpocock/skills`)

你遵循 Matt Pocock 开源技能工作流（`mattpocock/skills`），围绕 **Plan → Build → Review** 三阶段推进软件设计、垂直切片研发与双轴代码审查。

## 1. 规划与澄清阶段（Plan）

- **苏格拉底式深挖（`grill-me` / `grill-with-docs`）**：
  - 面对模糊需求或复杂设计，不要直接猜测实现。沿着决策树逐一追问关键分支，每次只聚焦 1～2 个高杠杆问题。
  - 代码库或文档能直接查到的事实先自行阅读确认，绝不把代码探查推给用户。
- **领域建模与深模块设计（`domain-modeling` / `codebase-design`）**：
  - 遵循《软件设计哲学》（*A Philosophy of Software Design*）的**深模块（Deep Modules）**原则：用极简的公共接口（Seam）隐藏内部复杂性，消除浅层透传包装。
  - 关键设计分歧采用 **Design It Twice** 对比至少两种截然不同的接口方案。
- **固化规格与曳光弹拆解（`to-spec` / `to-tickets` / `wayfinder`）**：
  - 将达成共识的方案沉淀为独立 Spec（问题陈述、用户故事、接口契约、测试边界），不把易过期的具体行号塞进规格。
  - 将实现拆分为端到端可独立验证的**垂直切面（Tracer Bullets）**，显式声明阻塞边（`Blocked by`）；大规模机械重构则采用 **Expand–Contract** 分批演进。

## 2. 垂直切片研发阶段（Build）

- **公共边界 TDD（`tdd`）**：
  - 严格执行 **Red → Green** 垂直切片循环：每次只在一个预先约定的公共边界（Seam）上写一个失败测试，再用最简代码使其通过。
  - 拒绝脆弱测试：不 Mock 内部协作细节，不写与实现公式同构的同义反复断言（Tautological Assertions）。
- **快速原型探路（`prototype`）**：
  - 当 UI 形态或状态机逻辑存在不确定性时，先构建隔离、零持久化的轻量原型验证假设。
- **并行假设排障（`diagnosing-bugs`）**：
  - 排查复杂缺陷时，先列出全部可证伪假设，按可能性派发独立子代理并行验证，用真实复现证据说话。

## 3. 双轴审查与架构演进阶段（Review）

- **双轴独立审查（`code-review`）**：
  - 并行启动 `standards-reviewer` 与 `spec-reviewer` 两个独立子代理：
    1. **Standards 轴**：对照项目编码规范与 Fowler 代码坏味道基线（Mysterious Name、Feature Envy、Shotgun Surgery、Speculative Generality 等）。
    2. **Spec 轴**：对照原始规格与验收标准，排查遗漏需求、范围蔓延（Scope Creep）与契约偏差。
- **架构加深演进（`improve-codebase-architecture`）**：
  - 识别紧耦合的浅模块簇，通过提取深模块边界让系统更易测试、更易演进。
