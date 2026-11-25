---
name: guizang-magi2-skill
license: AGPL-3.0
description: MAGI-2 视频提示词调优、LibTV MCP（含 Antigravity 适配修复）画布编排，以及 Video to Code（视频转一镜到底交互网页）与 Code to Video（静音代码动作灰盒转风格化大片）双向内容生产工作流。只要用户想写或优化 MAGI-2 提示词、在 Antigravity / Claude Code / Codex 里接入或修复 LibTV MCP、把参考视频与透明底贴纸做成视差滚动产品官网、或者用代码预演灰盒精准控制 AI 视频动作，哪怕没提这个 skill，都应先读它再动手。End-to-end MAGI-2 prompt optimization, LibTV MCP setup & Antigravity adapter fix, and bidirectional Video-to-Code / Code-to-Video co-creation workflows.
---

# MAGI-2 × Coding Agent 双向创作指南（Video to Code & Code to Video）

这份 Skill 来自一次围绕 LibTV 上 **MAGI-2** 视频模型与编程大模型（Google Neon / Claude / GPT）的完整实战。

核心思路很简单：视频模型单秒成本降到几分钱、理解力提上来之后，它和写代码的 Agent 不再是各干各的——**先用几毛钱的视频给网页定动势和审美（Video to Code），或者反过来用几百行代码给视频锁死分镜、卡点和动作轨迹（Code to Video）**，两边的短板刚好互补。

下面的每一条规则，都对应实测里真金白银踩过的坑。

## 快速路由

| 你现在要做的事 | 先读 / 先跑什么 |
|---|---|
| 安装或修复 Antigravity / Claude Code / Codex 上的 LibTV MCP | 跑 `python3 scripts/setup_libtv_antigravity.py`，详见 [`references/libtv-mcp-antigravity.md`](references/libtv-mcp-antigravity.md) |
| 写或改 MAGI-2 视频提示词（防润色压缩、防滑步、防眼球发光、锁死动态中文字） | 读 [`references/magi2-prompt-guide.md`](references/magi2-prompt-guide.md) |
| **Video to Code**：用视频 + 透明底贴纸做一镜到底滚动官网、Canvas 流体、变速电子乐 | 读 [`references/workflows.md`](references/workflows.md) 第一部分，贴纸跑 `scripts/make_diecut_stickers.py` |
| **Code to Video**：用代码灰盒 + 关键帧接力图控制水墨/动画/游戏大片 | 读 [`references/workflows.md`](references/workflows.md) 第二部分，灰盒预处理跑 `scripts/prep_code_previs.py` |

---

## 开工前先对齐三件事

1. **检查 LibTV MCP 是否已连通**。如果在 Antigravity 里还没装 LibTV 插件，或者遇到连接超时、找不到 `npx`，先运行 `python3 scripts/setup_libtv_antigravity.py` 完成修复，再调 `doctor` / `list_projects` 验证登录态。
2. **确认走哪条链路**：
   - 做产品官网、活动落地页、互动叙事页 → 走 **Video to Code**（先在 LibTV 出分镜与 10 秒连续动效视频，再让 Agent 对照视频写单舞台网页，不要让 AI 凭空用 CSS 画图形）。
   - 做复杂打斗、卡点运镜、风格化游戏 PV / 动画短片 → 走 **Code to Video**（先写代码输出 25fps 静音动作灰盒，满意后再连同 3~4 张设定图送进 LibTV 全能参考）。
3. **每一步都要看真实画面，不要只看命令不报错**。生成完贴纸打开看边缘、导出完灰盒抽帧看有没有残留辅助线、网页写完启动本地服务验证滚动与流体锚点。

---

## 一、MAGI-2 提示词七条硬规则（每次提交前自检）

MAGI-2 是典型的**字面级物理渲染器**——写了就有，没写就省，而且上游默认带一层提示词润色压缩。完整原理解析与四套实战模板见 [`references/magi2-prompt-guide.md`](references/magi2-prompt-guide.md)。

1. **高密度短句（10 秒控制在 350~550 字）**：删掉“极具张力、史诗感、无缝衔接”等废话；客户端有润色开关时优先关掉。
2. **零否定词 + 眼部光源绝对隔离**：把“不要/禁止/无”全部改写成正向物理状态。**严禁把“眼睛/瞳孔/目光”和任何光源词（月光/冷光/微光/反光/映出）写在同一句**，否则必出灯泡发光眼；只写颜色和神态（如`深褐眼眸、纯黑瞳仁冷峻锁死镜头`）。
3. **三段式发力链防滑步**：地面角色严禁写“保持某姿态高速移动”。必须写清 **起势蓄力 → 跨步拧腰发力 → 惯性卸力**，并强制主体跨画幅进出；全身奔跑严禁配“贴地机位”（会切掉上半身），改用`中全景全身侧向高速跟拍（完整保留头顶至双脚）`。
4. **特写补齐前中后三层细节**：近景特写必须同时交代前景虚化遮挡物、中景生理动态（转头、呼出白雾、汗珠/发丝位移）和后景散景动态，否则背景会退化成空塑料板。
5. **音画同句焊接（80% 硬拟音 + 20% 极简低频）**：把碰撞拟音直接焊死在动作发生的那半句里（如`剑刃斜削青竹，同步爆出竹干脆裂声与金属破空声`）。避免同时点名三种以上配乐乐器；需要复杂旋律时只出纯拟音，配乐交给代码或外部音频后混。
6. **动态中文用双引号绑定物理载体**：把目标文字放进英文双引号（如`"破晓萃取"`），绑死在热敏小票、印章、触控屏等实体表面，并给足 `1.5~2.0s` 稳镜或微推窗口。
7. **尾帧永远保持进行时**：最后一句严禁写“停稳、定格、静止”，让衣摆、水雾、雨滴或镜头持续运动到最后一帧。

---

## 二、LibTV MCP 四条防翻车铁律

连接配置与报错排查详见 [`references/libtv-mcp-antigravity.md`](references/libtv-mcp-antigravity.md)。

1. **`magi-2` 统一走 `intent: "reference"`（全能参考）**：当前 LibTV MCP 上 `magi-2` 未开放 `frames2video`（首尾帧模式会报 `VIDEO_PREFLIGHT_FAILED`）。哪怕只有单张垫图做图生视频，也一律传 `intent: "reference"` + `referenceImageNodes` + 提示词 `{{Node <id>}}`。
2. **多模态节点必须在开头写清排他分工**：同时连入视频和图片节点时，第一段明确声明谁管动作、谁管美术（如：`{{Node video_1}} 仅控制角色运动轨迹、顿帧与镜头推拉，完全去除原视频几何色块；{{Node img_1}} 锁定场景光影；{{Node img_2}} 锁定主角正侧比例`）。
3. **遇到 `wait_interrupted` 严禁重发生成请求**：10~30 秒视频渲染常超过单次工具等待窗口并返回 `wait_interrupted` / `GENERATION_WAIT_TIMEOUT`。此时云端仍在正常渲染，**绝不要再次调用 `generate_video`（会双倍扣费）**，改用 `task_status` 或 `read_node` 轮询既有任务直到拿到成片 URL。
4. **抠图素材优先用 `Seedream 5.5` 原生透明底**：生成网页复用的产品、冰块、道具时直接指定 `background: "transparent"`，拿到干净 RGBA 原图后再跑 `scripts/make_diecut_stickers.py` 烘焙波普贴纸描边。

---

## 三、双向工作流验收清单

架构拆解与核心代码模式详见 [`references/workflows.md`](references/workflows.md)。

### 玩法一：Video to Code（视频转一镜到底交互网页）
| 阶段 | 关键做法 | 验收标准 |
|---|---|---|
| 1. 分镜与视频原型 | LibTV 六宫格分镜 → `MAGI-2` 生成 10s 高饱和连续转场视频 | 转场动势连贯、节奏清晰 |
| 2. 刀版贴纸素材 | `Seedream 5.5` 透明底原图 → `make_diecut_stickers.py` 加白边黑线或自动切分多物体 | 边缘圆润无白刺、Alpha 干净 |
| 3. 单舞台滚动底座 | 单一 `100vw×100vh` `sticky` `#masterStage` + 二阶弹簧阻尼，**禁止多 section 上下硬切** | 慢滚快滚均无横向接缝与闪烁 |
| 4. 实时流体与变速配乐 | `getBoundingClientRect()` 实时锚定 Canvas 倾倒流体；WebAudio 合成器随滚动速度动态拉升 BPM | 缩放窗口流体不脱靶、滚快音乐加速 |

### 玩法二：Code to Video（静音代码灰盒转风格化大片）
| 阶段 | 关键做法 | 验收标准 |
|---|---|---|
| 1. 代码动作灰盒 | Canvas / Three.js 写出准确头身比剪影、受击 3 帧顿帧、震屏；**禁止持久几何线框、Z 字折线和血条 UI** | 刀光在 4~6 帧内消散，无网格线残留 |
| 2. 物理静音与序列帧体检 | 必跑 `prep_code_previs.py` 剥离音轨（`-an`）并导出 12 宫格体检图 | `ffprobe` 确认 0 音轨，体检图无杂线 |
| 3. 关键帧接力图矩阵 | 准备 3~4 张风格图：开场场景图 + 角色正侧设定卡 + 中段交锋垫图 + 高潮大招特效图 | 覆盖前中后全时段视觉锚点 |
| 4. 全能参考重绘与对比 | LibTV `reference` 模式绑定静音灰盒 + 接力图，出片后跑 `--compare` 合成上下同屏对比 | 动作帧级咬合，水墨/材质彻底重绘，原生打击音效干净 |

---

## 四、随附脚本速查

```bash
# 1) 一键配置/修复 Antigravity 上的 LibTV MCP（自动探测 npx 路径、长超时与代理环境）
python3 scripts/setup_libtv_antigravity.py

# 2) 将透明底 PNG 烘焙为波普风白边+黑线刀版贴纸（支持单图、目录批处理、多物体自动切图）
uv run --with pillow --with numpy --with scipy python3 scripts/make_diecut_stickers.py \
  input.png output_sticker.png --white-px 14 --black-px 5 --shadow

# 3) Code-to-Video 灰盒预处理：物理剥离音轨 (-an) + 标准化 1080p 25fps + 生成 12 帧体检图
python3 scripts/prep_code_previs.py raw_previs.mp4 previs_mute.mp4 --sheet check_12frames.jpg

# 4) 生成上屏代码灰盒 vs 下屏 MAGI-2 成片的同屏验收对比视频
python3 scripts/prep_code_previs.py --compare previs_mute.mp4 magi2_final.mp4 -o compare_top_bottom.mp4
```
