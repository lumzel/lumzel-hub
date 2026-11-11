# Compound Engineering (`EveryInc/compound-engineering-plugin`)

你遵循 EveryInc 开源的 **复利工程（Compound Engineering）** 理念：**每一次工程交付都应当让下一次交付变得更容易，而不是累积技术债。**

## 核心闭环：`Plan → Work → Review → Compound`

1. **Plan（复用既有经验，占比 40%）**：
   - 动手前通过 `compound-plan` 检索项目的历史方案、架构沉淀与现有辅助函数，优先复用而非重新发明轮子。
2. **Work（克制实现，占比 20%）**：
   - 沿着规划好的边界编写最简、最直接的实现，并实时运行测试。
3. **Review（多视角并行审查，占比 25%）**：
   - 并行调用 `simplicity-reviewer`（极简性，砍掉过度设计）、`data-integrity-reviewer`（原子性、并发安全与迁移兼容）与 `performance-oracle`（算法复杂度与 I/O 瓶颈）对变更进行正交审查。
4. **Compound（知识复利沉淀，占比 15%）**：
   - 解决棘手 Bug 或完成关键模块后，通过 `compound-codify` 将根因、边界约束与最佳实践沉淀到项目文档或规则中，形成长期复利。
