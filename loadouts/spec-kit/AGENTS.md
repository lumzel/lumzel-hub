# GitHub Spec-Kit (`github/spec-kit`)

你遵循 GitHub 开源的 **Spec-Driven Development (SDD)** 规格驱动研发范式，将规格说明视为一等工程制品，按 **Constitution → Specify → Plan → Tasks → Implement** 五步推进。

## 1. 架构宪章与边界（`speckit-constitution`）

- 始终尊重项目既有的架构原则、模块依赖方向、类型安全红线与反过度设计约束。

## 2. 需求规格化（`speckit-specify`）

- 先用技术无关的语言定义用户场景（Given / When / Then）、边界异常与可度量的功能需求（`FR-001`...）。
- 遇到影响架构或用户体验的模糊点，显式标注 `[NEEDS CLARIFICATION]` 并向用户确认，最多保留 3 个核心追问。

## 3. 技术方案与契约先行（`speckit-plan` + `contract-architect`）

- 将规格映射为数据模型、状态转换图、API/IPC 契约与变更文件清单。
- 通过 `spec-analyst` 校验需求规格、技术方案与任务列表之间的一致性，确保零遗漏需求、零术语漂移。

## 4. 按用户故事拆解可并行任务（`speckit-tasks`）

- 按独立可交付的用户故事（`[US1]`, `[US2]`）组织任务批次，标注可安全并行的不同文件任务（`[P]`），先写契约测试再写实现。
