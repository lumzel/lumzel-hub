# Video to Code 与 Code to Video 双向工作流工程手册

这份文档把两套核心玩法拆成可落地的工程步骤与代码骨架，方便编程 Agent 直接照着搭，不用从零试错。

## 目录
1. [玩法一（正向）：Video to Code（视频动势 + 透明贴纸 → 一镜到底交互官网）](#1-玩法一正向video-to-code视频动势--透明贴纸--一镜到底交互官网)
2. [玩法二（反向）：Code to Video（静音代码灰盒 + 关键帧接力图 → 风格化大片）](#2-玩法二反向code-to-video静音代码灰盒--关键帧接力图--风格化大片)

---

## 1. 玩法一（正向）：Video to Code（视频动势 + 透明贴纸 → 一镜到底交互官网）

直接让大模型凭空写产品官网并用纯 CSS 画插画，十有八九会做成生硬的色块卡片。反过来，先在 LibTV 里花几毛钱用 **MAGI-2** 生成一条高饱和连续转场的参考视频，再用 **Seedream 5.5** 生成同画风透明底产品贴纸，让编程模型照着视频的分镜动势、配色与节奏写代码，第一版就能做出接近商业互动站的效果。

### 整体链路
```text
LibTV 六宫格分镜图 ──► MAGI-2 生成 10s 连续转场视频（定配色、定几何遮罩动势、定节奏）
Seedream 5.5 (background: "transparent") ──► make_diecut_stickers.py（烘焙白边黑线波普刀版贴纸 & 自动切分多物体）
                                                    │
                                                    ▼
              Coding Agent（零构建依赖 Vanilla HTML / CSS / Canvas / WebAudio）
              ├─ 单舞台 #masterStage（sticky 100vw×100vh + 950vh 滚动轨道，消灭页面硬接缝）
              ├─ 二阶临界阻尼弹簧求解器（平滑滚轮抖动，同时输出实时滚动速度 v）
              ├─ getBoundingClientRect() 动态锚定的 60fps Retina Canvas 倾倒流体与飞溅粒子
              └─ 随滚动速度实时拉升 BPM（88–138 BPM）的程序化 WebAudio 合成器 + 频谱联动
```

### 关键实现步骤与避坑点

#### 第 1 步：六宫格分镜与 MAGI-2 转场原型
1. 在 LibTV 先出一张 **3×2 六宫格分镜设定图**，统一主色调（如克莱因蓝 `#1B39FF` + 亮橙 `#FF5A1F` + 柠檬黄 `#FFE135` + 米白底 `#FAF6EE`）与产品造型。
2. 用 `magi-2` `reference` 模式基于六宫格生成 10 秒连续 MG 转场视频（包含同心圆旋转、丝带横扫遮挡、45° 对角线劈开、双快门合拢等几何转场）。
3. **Agent 拆解视频**：先抽帧读取视频每一幕的起止时间、背景色号、遮罩几何方向与主体运动曲线，写成结构化分镜表再动笔写 HTML。

#### 第 2 步：透明底原图与波普刀版贴纸（素材双向复用）
1. 在 LibTV 调用 `Seedream 5.5` 生成产品本体、倾倒姿态、玻璃杯、飞散咖啡豆/方冰等独立素材，参数务必开启 `background: "transparent"`。
2. 运行 [`scripts/make_diecut_stickers.py`](../scripts/make_diecut_stickers.py) 用欧氏距离场（EDF）生成圆润白边 + 粗黑轮廓线；一张图里包含多颗豆子或冰块时加 `--split-components` 自动切成独立精灵图：
   ```bash
   uv run --with pillow --with numpy --with scipy python3 scripts/make_diecut_stickers.py \
     raw_sheet.png ./assets/cutouts/ --split-components --prefix bean --white-px 12 --black-px 4 --shadow
   ```

#### 第 3 步：单舞台无接缝滚动架构（严禁多 `<section>` 堆叠）
传统网页一幕一个 `<section>` 上下拼接，滚起来必然出现死板的横线断层。正确做法是**全站只有一个 `position: sticky; top: 0` 的全屏 `#masterStage`**，所有转场通过 `clip-path`、SVG 丝带路径与同一张主角贴纸的跨幕连续位移完成：

```javascript
// 二阶弹簧阻尼滚动核心：既消除鼠标滚轮阶跃卡顿，又拿到归一化滚动速度 scrollSpeed
const state = { target: 0, pos: 0, vel: 0, speedNorm: 0 };
const STIFFNESS = 120, DAMPING = 22;

function tickSpring(dt) {
  const safeDt = Math.min(dt, 0.033);
  const force = (state.target - state.pos) * STIFFNESS;
  state.vel = (state.vel + force * safeDt) * Math.exp(-DAMPING * safeDt);
  state.pos += state.vel * safeDt;
  // 归一化实时滚动速率 [0, 1]，用于驱动流体飞溅强度与 WebAudio 动态 BPM
  state.speedNorm = Math.min(1, Math.abs(state.vel) * 3.2);
}
```

#### 第 4 步：DOM 坐标实时锚定的 60fps Canvas 流体
冲泡/倾倒环节不要用死位置的 GIF，而是在每帧 `requestAnimationFrame` 里实时读取壶嘴/袋口贴纸与杯口贴纸的屏幕包围盒（`getBoundingClientRect()`），在全屏 Retina `<canvas>` 上动态绘制二次贝塞尔抛物线液柱、杯内液面上升涡旋与飞溅液滴——这样无论浏览器怎么缩放，水流永远精准从壶嘴落进杯口。

#### 第 5 步：随滚动速度变 BPM 的程序化 WebAudio 音乐
- 当 MAGI-2 原片只有拟音与口播、缺少配乐时，可以用 WebAudio 写一套紧凑的鼓组 + 贝斯 + 合成器琶音音序器：
  - **离线复用**：把合成器渲染成 WAV，用 `ffmpeg` 带侧链闪避（sidechain ducking）混回广告视频。
  - **在线交互**：直接放进网页，在用户首次点击/滚动解锁 `AudioContext` 后，按 `bpm = 88 + state.speedNorm * 50` 实时改变节拍间隔——用户滚得越猛，鼓点越快、高通滤波越亮，页面上的频谱柱也跟着实时跳动。

---

## 2. 玩法二（反向）：Code to Video（静音代码灰盒 + 关键帧接力图 → 风格化大片）

纯靠文字抽卡做复杂武打或游戏 Boss 战，想改“第 3.2 秒弹反顿帧 3 帧再接腾空下劈”几乎不可能。反过来，让编程模型先写 200 行 Canvas / Three.js 代码生成一段节奏、站位、运镜分毫不差的动作灰盒视频，改代码改到满意为止（零生成成本），最后一次性交给 LibTV 的 `magi-2` 全能参考重绘成水墨或次世代画风。

### 整体链路
```text
Coding Agent 编写确定性动作预演（HTML5 Canvas / Three.js）
  ├─ 锁死真实头身比剪影、起跳抛物线、3 帧受击顿帧（Hit-stop）与镜头推拉震屏
  ├─ 去几何化特效引导（半透明渐变弧面 4~6 帧消散，严禁网格线、Z 字折线与 HUD 血条）
  └─ 运行 scripts/prep_code_previs.py ──► 强制剥离音轨 (-an) + 25fps 标准化 + 12 帧体检图
                                                    │
LibTV 画布接入 3~4 张关键帧接力图（Seedream 5.5）     │
  ├─ 图 1：开场场景空间与主色调光影                 │
  ├─ 图 2：主角正侧比例设定卡（防中途变形）         ├──► magi-2 `reference` 全能参考
  ├─ 图 3：中段近身交锋 / 弹反火星垫图              │    ──► 风格化水墨/动画成片（含原生打击音效与配乐）
  └─ 图 4：高潮腾空大招特效笔触图                   │    ──► prep_code_previs.py --compare 上下同屏验收片
```

### 四条决定成败的工程细节

#### 细节 1：灰盒视频必须物理剥离音轨（`ffmpeg -an`）
这是最容易踩的大坑：**MAGI-2 是音画联合建模架构**。如果代码导出的灰盒视频里带了用 Python/WebAudio 随便拼的“哔哔”合成音效，模型会忠实模仿那股廉价电子味，导致最终大片里全是塑料电音。
- **硬规则**：上传前必须运行 `scripts/prep_code_previs.py` 彻底剥离音频流（确保 `audio_streams == 0`），把声音空间完全腾出来交给提示词生成真实刀剑碰撞、踏水轰鸣与战鼓。

#### 细节 2：彻底去几何化，防止“代码辅助线渗漏”
MAGI-2 对参考视频里的锐利几何图形极其敏感：
- 如果灰盒里画了持久不散的亮色折线（Z 字闪电）、正圆线框、八角星矢量框、地面透视网格线或顶部血条文字，成片里就会悬浮着极其违和的几何线框。
- **正确画法**：
  - **角色**：按接近真人的头身比画柔和剪影与飘带/披风摆动，不要画火柴人细线。
  - **刀光与轨迹**：用首尾渐隐的半透明弧形色带，**必须在 4~6 帧内快速淡出归零**。
  - **受击与爆炸**：用无描边的不规则烟团粒子 + 3 帧画面顿帧（Hit-stop）+ 镜头微震来传递力量感。

#### 细节 3：“1 段静音灰盒 + 3~4 张关键帧接力图”防中后段退化
只给 1 张开场概念图配 10 秒剧烈动作灰盒时，到了第 6 秒以后的特写或满屏大招，画面很容易退化回灰盒的扁平色块质感。用 **3~4 张同画风关键帧接力图**分段锁死视觉锚点，从第 0 帧到第 250 帧都能保持饱满笔触：
1. **图 1（场景锚点）**：空镜或远景对峙图，锁死地面肌理、远景层次与环境光色温。
2. **图 2（角色设定卡）**：白底或浅底的主角正/侧面全身设定图，锁死服饰细节、武器长度与脸部特征。
3. **图 3（交锋关键帧）**：双人近身兵刃相交、火花四溅的瞬间构图，喂给中段拼刀戏。
4. **图 4（大招特效卡）**：高潮腾空重劈或满幅水墨/烈焰爆发的关键帧，喂给尾段高潮戏。

#### 细节 4：预处理体检与上下分屏验收命令
```bash
# 第一步：剥离音轨、转标准 1920x1080 25fps，并导出 12 宫格体检图检查有无几何杂线
python3 scripts/prep_code_previs.py raw_greybox.mp4 greybox_mute.mp4 --sheet greybox_check.jpg

# 第二步：（先打开 greybox_check.jpg 目视确认干净，再上传 LibTV 跑 magi-2 reference）

# 第三步：拿到成片后一键合成上下同屏对比视频（上屏代码灰盒，下屏成片，保留成片音轨）
python3 scripts/prep_code_previs.py --compare greybox_mute.mp4 magi2_final.mp4 -o compare_top_bottom.mp4
```
