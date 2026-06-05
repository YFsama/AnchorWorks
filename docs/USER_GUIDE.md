# Anchorworks — 用户指南

> 1500 字快速上手。深入细节请按 **F1** 打开应用内的 Help Center
> （63 个专题，~7000 字）。

---

## 这是什么

Anchorworks 是一款 Web 优先的矢量编辑器。可以当成「装在浏览器里的 Illustrator」：
画矢量、排版、做品牌物料、给刻字机出 G-code/HP-GL、给打印机出 PDF。
内置 **Claude AI**，能让 AI 看到你的画布并直接修改。

**两种使用方式**：

1. 浏览器（推荐）：访问网址即可，不用装。Chrome/Edge 「安装为应用」后变独立窗口。
2. 桌面壳：Tauri 2 打包成 .deb / .rpm / .AppImage / .exe / .dmg，提供原生菜单、文件关联、串口直连。

---

## 下载安装（桌面版）

每次 release 的安装包都挂在 [Releases 页](https://github.com/YFsama/AnchorWorks/releases)。

| 系统 | 文件 | 首次打开备注 |
|---|---|---|
| **macOS** | `Anchorworks_<版本>_universal.dmg` | 当前**未做 Apple 公证**。双击会被 Gatekeeper 拦截，提示「无法打开，因为 Apple 无法验证开发者」。**解决方法**：在访达里**右键点 .app → 打开 → 在弹出框点「打开」**。macOS 记住你的选择，以后正常双击就行。 |
| **Windows** | `Anchorworks_<版本>_x64-setup.exe` | 当前**未做 Authenticode 代码签名**。SmartScreen 会弹「Windows 已保护你的电脑」。**解决方法**：点蓝字「**更多信息**」→ 出现「**仍要运行**」按钮 → 点它。 |
| **Linux deb (Ubuntu/Debian)** | `Anchorworks_<版本>_amd64.deb` | `sudo apt install ./Anchorworks_<版本>_amd64.deb` 自动装依赖 |
| **Linux rpm (Fedora)** | `Anchorworks-<版本>-1.x86_64.rpm` | `sudo dnf install ./...rpm` |
| **Linux 任意发行版** | `Anchorworks_<版本>_amd64.AppImage` | `chmod +x` 后直接跑，免安装 |

> **不想装？** 直接访问网页版即可。Chrome/Edge 浏览器 ⋮ 菜单 → **「安装 Anchorworks」** → 变成独立窗口应用，自动绑定 `.svg` / `.vstudio.json` 文件，离线可用。**推荐普通用户走 PWA 这条路**；只有需要原生文件对话框或串口直连时才需要桌面版。

### 为什么有「未签名」警告？

- macOS Apple Developer Program $99/年 + notarization 流程才能消除 Gatekeeper 警告
- Windows OV 代码签名证书约 ¥500/年 / EV 约 ¥2000/年才能消除 SmartScreen 警告

我们暂时没买这两个证书，所以首次打开会被警告。**但安装包本身是有更新器签名**（minisign）的，每次自动更新的 payload 都会校验，确保不会被中间人替换。

---

## 界面分区

```
┌──────────────────────────────────────────────────────────────┐
│  MenuBar   File / Edit / View / Document / Help · 撤销·重做   │  顶栏
├──┬─────────────────────────────────────────────────────┬─────┤
│工│                                                     │ 属性 │
│具│                  画布工作区                          │ 图层 │
│栏│                                                     │ 对齐 │
│  │                  + 画板（亮色"纸面"）                │ 画板 │
│  │                  + 周边为暗色"草稿区"                │ 符号 │
│  │                                                     │ 检查 │
│  │                                              ?  ←FAB│ 素材 │
├──┴─────────────────────────────────────────────────────┴─────┤
│  StatusBar   工具·缩放·对象数·选区·尺寸·画板翻页·刻画输出     │  底栏
└──────────────────────────────────────────────────────────────┘
```

- **画板内**（亮色 paper） = 真正要导出的页面内容。
- **画板外**（暗色 scratch） = 草稿区。在这里随便摆，导出时不算。
- 底栏 **GRID / SNAP / GUIDES / ANCHOR** 是可点击开关，可不进 View 菜单直接切换网格、网格吸附、智能参考线和锚点吸附。
- **? FAB**（右下角）= 快速帮助。一眼能看到 10 条最常用快捷键。

---

## 鼠标 / 手势速查

| 操作 | 手势 |
|---|---|
| 缩放 | 鼠标滚轮 · 触控板捏合 · Ctrl + 滚轮 |
| 平移视图 | **鼠标中键拖动** · 按住空格 + 左键拖动 · 触控板双指 |
| 选择 | 左键点击对象 · 拖动空白处框选 · Shift + 点击加选 |
| 复制选区 | 拖动时按住 Alt（部分浏览器是 Option） |
| 进入直接选择 | 选中后按 `A`，可拖动单个锚点 |
| 进入文本编辑 | 双击文本对象 |
| 上下文菜单 | 右键画布任意位置；可快速复制/剪切/粘贴、切换视图/参考线、导出所选、应用图像滤镜、对齐/分布、按对象类型批量选择、选择可见对象、未锁定对象、相同填充/描边/类型 |

---

## 键盘速查（按使用频率）

### 视图
| 快捷键 | 动作 |
|---|---|
| `Ctrl + 0` | 适合页面 |
| `Ctrl + 1` | 实际尺寸（100%） |
| `Ctrl + =` / `Ctrl + -` | 缩放进出（View 菜单、命令面板和右键 View / Guides 都显示当前自定义绑定） |
| `Ctrl + Shift + 2` | 缩放到选区 |
| `Space + 拖动` | 临时切换为手形（Hand） |
| `Ctrl + Alt + Y` | 轮廓视图（只显示骨架） |
| `Ctrl + ;` | 显示 / 隐藏参考线 |

### 编辑
| 快捷键 | 动作 |
|---|---|
| `Ctrl + Z` / `Ctrl + Y` / `Ctrl + Shift + Z` | 撤销 / 重做（Edit 菜单、命令面板、顶栏和右键顶部都可执行；重绑定后提示同步更新） |
| `Ctrl + D` | 复制选区（Edit 菜单、命令面板和右键都可执行） |
| `Ctrl + C` / `Ctrl + X` / `Ctrl + V` | 复制 / 剪切 / 粘贴（Edit 菜单、命令面板和右键都可执行；Paste in Place / Front / Back、Duplicate、Group / Ungroup、Mask / Compound Path 的提示也会读取当前自定义绑定） |
| `Ctrl + Shift + V` / `Ctrl + F` / `Ctrl + B` | Paste in Place / Front / Back，适合保持位置或控制堆叠顺序 |
| `?` / Help → Keyboard Shortcuts | 打开响应式且可搜索的快捷键速查；卡片读取当前自定义 keymap 并在重绑定后刷新，小屏会自动从三列折成两列/单列，并显示 Eyedropper、Paste in Place / Front / Back、Select / Deselect All、Select Inverse、Mask / Compound Path、Transform Again、Average Anchor Points、Isolation Mode、字号调整、Lock / Unlock、Hide / Show、Cut Contour 和 Zoom to Selection 等高频命令；顶部 Text keys / Output keys / View keys / Edit keys 搜索配方可一键筛选文字、输出、视图或编辑类快捷键，聚焦配方组后可用 Left/Right 或 Home/End 浏览并立即填入搜索词、刷新匹配列表，同时向辅助技术读出当前配方名称和用途；Output keys 会同时筛出 print / cut / plotter / export 相关快捷键，并可把同一多关键词搜索带到 Customize Shortcuts 继续改键；搜索框可按命令名或当前按键过滤并显示匹配数量，Edit First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作，也可在搜索框按 Enter 把当前搜索词带到自定义快捷键并直接编辑首个匹配项，或按 ArrowDown 先聚焦速查里的首个匹配快捷键行，再用 Up/Down/Home/End 连续浏览可见快捷键，当前卡片会保持高亮并向辅助技术读出名称与序号；在自定义快捷键编辑器里 Edit First / Clear search 搜索操作同样可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作，也可按 ArrowDown 聚焦首个匹配快捷键行，再用 Up/Down/Home/End 浏览可重绑定行，当前行会保持高亮并读出名称与序号，或按 `Esc` 清空搜索；底部 **Customize Shortcuts…** 也组成键盘可浏览动作组，聚焦或用 Left/Right / Home/End 浏览时会向辅助技术读出当前动作，并可直接跳到完整自定义快捷键列表；Keyboard Shortcuts 与 Customize Shortcuts 的搜索若没有命中，空状态会直接显示 Clear search 恢复按钮，避免为了重新查找快捷键而回到搜索框逐字删除 |
| `Ctrl + K` 搜索 Copy / Cut / Paste | 不记快捷键时也可从命令面板执行内部画布剪贴板操作；命令面板搜索后的 Run First / Clear search 操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作；Edit 菜单还提供 Paste in Place / Front / Back，空剪贴板会提示，不会静默失败 |
| `Ctrl + A` / `Ctrl + Shift + A` | 全选 / 取消全选（Select Inverse、Select Next Above/Below 也会在菜单、命令面板和右键中同步当前自定义绑定） |
| `Ctrl + Shift + I` | Select Inverse，反选当前可编辑对象 |
| `Ctrl + G` / `Ctrl + Shift + G` | 编组 / 取消编组 |
| `Ctrl + 7` / `Ctrl + Alt + 7` | Make / Release Clipping Mask（Document 菜单和命令面板都会显示快捷键） |
| `Ctrl + 8` / `Ctrl + Alt + 8` | Make / Release Compound Path（适合把多路径合成刻线或还原编辑） |
| `Ctrl + >` / `Ctrl + <` | 增大 / 减小文字字号（Document → Type、命令面板和右键 Type 都显示） |
| `Alt + ←/→` / `Alt + ↑/↓` | 调整文字 tracking / leading，适合快速贴合门头字和弧形排版 |
| `Shift + X` / `D` | 交换 Fill / Stroke / 恢复默认填描；提示会跟随自定义绑定同步到 Document Appearance、命令面板和右键 Fill / Stroke |
| `Ctrl + ]` / `Ctrl + [` | 上移一层 / 下移一层（命令面板、Document 菜单和右键都显示当前绑定；按 Shift 走置顶/置底） |
| `Ctrl + Shift + ]` / `Ctrl + Shift + [` | 置于顶层 / 置于底层 |
| `Ctrl + 2` / `Ctrl + Alt + 2` | 锁定选区 / 解锁全部对象（菜单、命令面板、右键提示读取当前自定义绑定） |
| `Ctrl + 3` / `Ctrl + Alt + 3` | 隐藏选区 / 显示全部隐藏对象（菜单、命令面板、右键提示读取当前自定义绑定） |
| `Delete` / `Backspace` | 删除选区（Edit 菜单、命令面板和右键都显示 `Del / Backspace` 并可执行） |
| `← ↑ → ↓` | 微移（按 Shift 步进 10px） |
| `Escape` | 取消选择 / 完成路径 / 关对话框 |
| `Enter`（笔工具时）| 闭合当前路径 |

### 工具（单键无修饰）
| 键 | 工具 |
|---|---|
| `V` | 选择 / 移动 |
| `A` | 直接选择（锚点编辑） |
| `R` | 矩形 |
| `O` | 椭圆 |
| `L` | 直线 |
| `G` | 多边形 |
| `P` | 钢笔（贝塞尔） |
| `B` | 铅笔 / 笔刷 |
| `E` | 橡皮 |
| `T` | 文字 |
| `H` | 抓手 |
| `Z` | 缩放 |
| `M` | 测量距离 / 角度（左侧工具栏也可点击） |
| `I` | Eyedropper，采样对象外观（左侧工具栏也可点击） |

### 文件
| 快捷键 | 动作 |
|---|---|
| `Ctrl + Shift + S` | 保存项目（.vstudio.json） |
| `Ctrl + O` | 打开 |
| `Ctrl + S` | 导出 SVG |
| `Ctrl + P` | 打印… |
| `Ctrl + Alt + P` | 分页打印… |

### 帮助 / 隐藏
| 快捷键 | 动作 |
|---|---|
| `?` | 完整快捷键面板（可搜索快捷键，Text / Output / View / Edit 配方可用 Left/Right 或 Home/End 浏览并立即筛选；搜索操作 Edit First / Clear search 和底部 Close / Customize Shortcuts 也支持方向键浏览并读出当前动作） |
| `F1` | Help Center（63 主题；搜索框会显示总主题数、筛选匹配数，可点 Open First，或用 Left/Right / Home/End 浏览 Open First / Clear search 并读出当前动作，也可在搜索框按 Enter 打开首个匹配主题，也可按 ArrowDown 聚焦首个匹配主题，再用 Up/Down/Home/End 连续浏览主题，当前主题会向辅助技术读出标题、序号和分类；点 Clear search 或按 `Esc` 清空搜索） |
| `Ctrl + K` | 命令面板（85+ 命令模糊搜索，含剪贴板、主题、轮廓视图、网格和状态感知的吸附/参考线切换） |
| `Ctrl + ,` | 偏好设置 |
| `Ctrl + Shift + L` | 切换深 / 浅主题（Help 菜单、右键 Help / Settings 和命令面板都会显示将要切换到的主题） |

Help 菜单、命令面板、保存状态按钮和右键 **Help / Settings** 会读取同一套自定义快捷键映射，因此 Command Palette、Help Center、Keyboard Shortcuts、Preferences、Save Project、Variable Data、Theme 和 Debug Panel 的提示在重绑定后会同步更新。
| `Ctrl + Shift + D` | 调试面板（开发者用） |

> Mac 用户：以上 `Ctrl` 全部读作 `⌘`（Cmd）。

---

## 钢笔工具完整流程

钢笔（`P`）是最重要的矢量工具。Anchorworks 实现了完整贝塞尔编辑：

1. **下点**：单击放一个角点
2. **下点拖出切线**：按下后保持拖动，松开时变成平滑锚点（带切线手柄）
3. **闭合路径**：第 3 个点后回到第一个锚点附近，会出现高亮圆环，点击闭合
4. **完成开路径**：`Esc`
5. **强制闭合**：`Enter`
6. **改路径形状**（提交后）：切换到 `A`（直接选择），路径会显示菱形切线 + 方形锚点
   - 拖锚点 = 移动
   - 拖菱形 = 改曲线弧度
   - 双击锚点 = 平滑 ↔ 角点切换
   - Alt + 点击锚点 = 删除该锚点
   - 点击路径段中段 = 增加锚点（在该位置插入）

---

## AI 助手要点

按右上 **AI 按钮**（或 `Ctrl + K` 搜 "AI"）。

1. **首次使用** → 偏好设置里填入 Claude API Key（仅存本地 localStorage，不上传任何服务器）
2. **它能看见画布** —— 默认会把当前 viewport 截图发给模型
3. **它能直接改画** —— 通过 `replace_svg` / `add_svg` 等 tool 写入对象
4. **它能调用 Skills** —— `align_selection` / `distribute_objects` / `boolean_op` 等都注册成了 tool
5. **MCP** —— 在 AI 面板的「MCP Servers」标签可以加远程 MCP 服务器，远程 tool 会带 `mcp__` 前缀自动出现

**好的提问示例**：
- 「把这些图标网格对齐，5 列」→ AI 会调 align + distribute
- 「我要一张春节红包封面，喜庆但克制」→ AI 会用 replace_svg 生成
- 「这里加个 2mm 出血」→ AI 会调 set_artboard_bleed

**不好的提问**：
- 「这张图怎么样？」（没明确动作，AI 只能说好话）

---

## 视图 / 参考线

- 右键 **View / Guides** 子菜单、View 菜单或命令面板可缩放（Zoom In / Out、Actual Size、Fit to Page、Zoom to Selection），三处都会显示当前自定义的缩放快捷键；Outline View、显示/隐藏参考线等可重绑定命令也会在菜单、命令面板和右键中同步显示当前提示；也可切换网格、网格吸附、Smart Guides、Anchor Snap、标尺或锁定参考线。
- 同一子菜单也能从所选创建参考线、打开 Margin Guides 或清除参考线；Margin Guides 提供 Trim edge / Sticker safe / Office print / Banner hem 配方，可一键套用 3 / 5 / 10 / 25 mm 常用安全区，下面仍保留 0 / 3 / 5 / 10 / 15 / 25 mm 安全边距预设；聚焦配方或数值预设时可用 Left/Right 或 Home/End 浏览并立即更新 Margin 输入值，同时向辅助技术读出配方用途或当前安全边距毫米数，底部 Cancel / Reset / Apply 仍可方向键浏览后再 Space/Enter 执行，并向辅助技术读出当前动作；Reset 会恢复 Sticker safe 的 5 mm 贴纸安全区，适合从裁切边、办公打印或横幅包边试验回到常用贴纸排版安全区。

## 排版 / 对齐

- **Align & Distribute** 面板仍适合精调 Align To Selection / Artboard / Key Object、指定间距和路径查找器；Align 区域下方可直接 Center on Artboard，把当前选区一键居中到第一个画板且无画板/无选区时会解释原因；精确间距输入框下方提供 0 / 1 / 2 / 5 / 10 / 25 mm（或对应 px）预设，也可直接点带当前值高亮的 0H / 5H 或 0V / 5V 这类按钮把预设间距立即应用到水平或垂直方向；聚焦这些间距预设组时可用 Left/Right 或 Home/End 切换，水平/垂直应用行会随切换直接应用对应间距，适合快速做贴纸留白、门牌字距和多对象排版；Union / Subtract / Intersect / Exclude / Minus Back、Divide / Trim / Merge / Crop、Make / Release Clipping Mask（`Ctrl + 7` / `Ctrl + Alt + 7`）和 Make / Release Compound Path（`Ctrl + 8` / `Ctrl + Alt + 8`）等需要足够选区的命令会在条件不足或无法生成结果时提示。
- Document → **Align & Distribute**、右键同名子菜单或命令面板都提供左/中/右、顶/中/底、水平/垂直等距分布、在画板内分布和居中到画板；常用选区对齐也有可自定义快捷键：`Alt + Shift + ←/→/↑/↓` 对齐左/右/上/下，`Alt + Shift + H/V` 水平/垂直居中，`Alt + Shift + X/Y` 水平/垂直等距分布，菜单、右键和命令面板会同步显示当前绑定，适合从菜单栏、键盘搜索、画布右键或纯键盘快速整理版面。
- Document → **Appearance**、右键 **Fill / Stroke** 或命令面板可直接 Swap Fill / Stroke、恢复 Default Fill / Stroke，或设置 No Fill（`Ctrl + Alt + X`）/ No Stroke（`Ctrl + Alt + Shift + X`）；这些快捷键都可在 Help → Customize Shortcuts 改键并同步显示到菜单、右键和命令面板。
- Document → **Type**、命令面板和右键 **Type** 都显示同一套可自定义文字快捷键：Create Outlines、Break Text into Letters/Lines、Text on Arc、字号、tracking、leading、Find & Replace、Single-line Text、Change Case 和 Smart Punctuation 重绑定后都会同步更新提示；三处使用相同步进，便于在画布上快速把门头字、贴纸标签或弧形文字调到合适宽度。
- Document → **Appearance** 或右键 **Stroke alignment** 可把描边切换为 Center / Inside / Outside；Properties → Advanced stroke 的描边对齐按钮组也可用 Left/Right 或 Home/End 浏览并立即套用 Center / Inside / Outside，同时向辅助技术读出当前描边对齐模式，并快速开关 **Constant Stroke Width**，适合做贴纸外轮廓、图标边界和刻线缩放前的外观校正。
- Document → **Appearance**、右键 **Stroke width** 或命令面板可快速套用 0 / 0.5 / 1 / 2 / 4 / 8 px 线宽；Properties → Appearance 的 Stroke W 数值框下也有同样的一键预设按钮，聚焦该预设组时可用 Left/Right 或 Home/End 切换并应用，同时向辅助技术读出当前线宽 px 值，适合在无描边、细刻线、粗外框之间快速切换。
- **Offset Path** 的 -2 / -1 / +1 / +2 / +3 / +5 mm 预设、**Round Corners** 的 1 / 2 / 3 / 5 / 10 / 20 mm 半径预设、**Simplify Path** 的 0.5 / 1 / 1.5 / 3 / 5 / 8 px 容差预设，以及 **Margin Guides** 的 Trim edge / Sticker safe / Office print / Banner hem 配方与 0 / 3 / 5 / 10 / 15 / 25 mm 安全边距预设都可用 Left/Right 或 Home/End 浏览并立即更新输入值，且会向辅助技术读出当前配方用途或边距毫米数；Simplify Path、Offset Path 与 Round Corners 预设获得焦点或用方向键浏览时也会向辅助技术读出当前容差、内外偏移毫米数或圆角半径；Simplify Path、Offset Path 与 Round Corners 底部 Cancel/Apply 也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前提交动作，适合快速试路径清理强度、内外轮廓、贴纸白边、圆角标签、招牌线稿修边和印刷安全区。
- Document → **Appearance**、右键 **Stroke style** 或命令面板可快速切换 Solid / Dashed / Dotted、Line cap 和 Line join；Properties → Advanced stroke 也提供带预览图标的一键 Dash / Line cap / Line join 按钮，聚焦这些预览按钮组时可用 Left/Right 或 Home/End 浏览并立即套用虚线、端点或拐角，同时读出当前 Solid / Dashed / Dotted、Butt / Round / Square 或 Miter / Round / Bevel；当 Line join 为 Miter 时，Miter limit 下方提供 2 / 4 / 8 / 12 常用尖角限制预设，聚焦该预设组时可用 Left/Right 或 Home/End 切换并应用，同时读出当前尖角限制值，适合制作虚线刻线、圆头尺寸线、斜角/圆角招牌线稿。
- Document → **Appearance**、右键 **Blend mode** 或命令面板可快速套用 Normal / Multiply / Screen / Overlay / Difference 等常用混合模式；Properties → Blend mode 也提供带重叠色块预览的快速按钮，聚焦快捷模式组时可用 Left/Right 或 Home/End 浏览并立即套用 Normal / Multiply / Screen / Overlay / Difference，也可按 Space/Enter 确认当前按钮，并保留 All modes 下拉用于更多 Canvas 组合模式，用于导入图形的透明叠印、阴影和高光整理；Recolor Artwork 弹窗提供 Rotate map / Reverse map / Map to gray，可快速轮换、反向或灰度化整组选中色彩映射；也提供 Vinyl primary / Monochrome sign / Safety decal / Team colors 调色板配方，可把来源色按常用乙烯基、灰阶、安全贴花或队伍配色循环映射，聚焦映射动作后可用 Left/Right 或 Home/End 浏览并向辅助技术读出当前映射动作，聚焦配方组后方向键浏览会立即套用并高亮当前配色，同时向辅助技术读出配方名称、用途和颜色数量；Blend 弹窗提供 3 / 5 / 10 / 20 常用步数预设，聚焦这些步数预设后可用 Left/Right 或 Home/End 浏览并立即更新步数，同时向辅助技术读出当前步数；底部 Cancel / Reset / Apply 也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作；Reset 会恢复默认 5 steps，便于从密集或稀疏混合试验回到常用 Illustrator 混合起点；Recolor Artwork、Adjust Hue、Saturate、Adjust Brightness 弹窗底部 Reset/Cancel/Apply 或 Cancel/Apply 可用 Left/Right 或 Home/End 浏览后再 Space/Enter 执行，且会向辅助技术读出当前动作；Adjust Hue 弹窗提供 -180 / -120 / -60 / 0 / +60 / +120 / +180° 常用色相偏移预设，聚焦这些色相预设后可用 Left/Right 或 Home/End 浏览并立即更新滑杆与高亮状态，同时向辅助技术读出当前色相偏移角度；底部 Cancel / Reset / Apply 也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作；Reset 会恢复 0° 中性色相偏移并清除旧预设播报，便于从大幅换色试验回到原始色相；Saturate 弹窗提供 -100 / -50 / 0 / +50 / +100% 常用饱和度预设，聚焦这些饱和度预设后可用 Left/Right 或 Home/End 浏览并立即更新滑杆与高亮状态，同时向辅助技术读出当前饱和度百分比；底部 Cancel / Reset / Apply 也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作；Reset 会恢复 0% 中性饱和度并清除旧预设播报，便于从去色或增强饱和试验回到原始色彩强度；Adjust Brightness 弹窗提供 -50 / -25 / 0 / +25 / +50% 常用亮度预设，聚焦这些亮度预设后可用 Left/Right 或 Home/End 浏览并立即更新滑杆与高亮状态，同时向辅助技术读出当前亮度百分比；底部 Cancel / Reset / Apply 也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作；Reset 会恢复 0% 中性亮度并清除旧预设播报，减少批量改色时误点应用；Freeform Gradient 弹窗提供 Poster glow / Neon sign / Metal plate / Heat map 配方预设，可一键套用尺寸和色标组合，聚焦预设组后可用 Left/Right 或 Home/End 浏览并立即载入尺寸和色标，同时向辅助技术读出配方名称、用途、画布尺寸和色标数量；底部 Cancel/Create 也支持同样的键盘浏览，并向辅助技术读出当前动作，便于不用鼠标确认自由渐变素材。
- Document → **Appearance**、右键 **Opacity** 或命令面板可快速套用 100% / 75% / 50% / 25% 不透明度；Properties → Appearance 的 Opacity 滑杆下也有同样的一键百分比按钮，聚焦该预设组时可用 Left/Right 或 Home/End 切换并应用，同时向辅助技术读出当前不透明度百分比，适合做水印、底纹、叠印预览和透明辅助线。
- Properties → Appearance 的 **Suggest palette** 会基于当前填充生成 5 色推荐配色；生成后的色块组可用 Left/Right 或 Home/End 浏览并立即应用为填充色，也可按 Space/Enter 确认当前色块，适合快速试招牌配色和贴纸底色。
- Document → **Appearance**、右键 **Pattern Fill** 或命令面板可直接套用 Checker / Stripes / Dots / Crosshatch 预设；Properties → Pattern Fill 也用四宫格预览按钮显示当前颜色组合，聚焦图案类型组时可用 Left/Right 或 Home/End 浏览并立即套用 Checker / Stripes / Dots / Crosshatch，并提供 8 / 12 / 16 / 24 / 32 / 48 图案尺寸预设；聚焦尺寸预设组时可用 Left/Right 或 Home/End 切换并立即应用当前尺寸，同时向辅助技术读出尺寸值，需要自定义颜色和尺寸时再到 Properties 面板精调或按 Apply pattern 重新应用。
- Document → **Appearance**、右键 **Drop shadow** 或命令面板可快速套用 Soft Shadow、Hard Shadow、Glow，或 Clear Shadow 清除投影；Properties → Drop shadow 开启后也显示同样的一键预设，聚焦预设组时可用 Left/Right 或 Home/End 浏览并立即套用 Soft / Hard / Glow / Clear，当前匹配预设会高亮，也可继续精确颜色、模糊和偏移。
- 命令面板中的 No Fill / No Stroke、描边宽度/端点/拐角、混合模式、图案填充、投影和不透明度等外观命令在无选区时会提示，不会静默无效。
- 命令面板可直接搜索 Align left、Distribute horizontally、Distribute in Artboard 等命令，并显示匹配数量；底部会直接提示 ↑/↓ 浏览、Home/End 跳到首尾、PgUp/PgDn 快速跳段、Enter 执行、Esc 清空/关闭，当前命令会通过辅助技术读出名称与序号；输入后可点 Run First 立即执行首个匹配命令，也可在 Run First / Clear search 搜索操作组内用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行；若没有命中，空状态会直接显示 Clear search 恢复按钮；也可按 `Esc` 先清空搜索，再按一次关闭，适合键盘优先整理多对象版面；右键 **Help / Settings** 可从画布直接打开 Command Palette、Help Center、Keyboard Shortcuts、Customize Shortcuts、Preferences、Check for Updates，并快速切换 Light/Dark Theme / High Contrast，或用 Debug Panel（`Ctrl + Shift + D`）排查问题；Debug Panel 顶部 Copy diagnostics / Download diagnostics / Clear log / Close 操作组可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，当前诊断动作会向辅助技术读出。通知 toast 出现操作按钮或关闭按钮时，也可在按钮组内用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，避免导入、更新、恢复等反馈流程需要鼠标关闭或确认。全局确认弹窗（如 New document / Clear canvas、删除或清理类确认）底部 Cancel / OK 也支持 Left/Right 或 Home/End 浏览，危险操作默认聚焦 Cancel，`Esc` 仍取消，降低误确认风险。顶部栏语言胶囊打开后可在语言菜单内用 Up/Down、Left/Right 或 Home/End 浏览 EN / 中文，聚焦语言项后按 Space/Enter 即可切换；在语言胶囊本身按 ArrowDown / ArrowUp 会直接跳到首个 / 末个语言项。Preferences 弹窗打开后会自动聚焦搜索框，顶部提供 Design focus / Production prep / Presentation 工作区配方，可一键切换深色设计、生产高对比吸附或浅色演示设置，聚焦配方组后可用 Left/Right 或 Home/End 浏览并立即套用到草稿，按钮会以 aria-pressed 高亮当前配方，并向辅助技术读出当前配方名称和用途；也可按设置名搜索并自动跳到匹配分区，显示匹配数量，Go First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作；若 Preferences 搜索没有命中，空状态会直接显示 Clear search 恢复按钮；也可在搜索框按 Enter 或按 ArrowDown 聚焦首个匹配分区；底部 Cancel / Reset / Apply / Save 操作可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并向辅助技术读出当前动作；Reset 会恢复打开 Preferences 时捕获的草稿、回到 General 分区并清空搜索与旧配方播报，方便试用工作区配方、AI、默认画布或吸附设置后安全回到打开前状态；搜索框仍支持 `Esc` 清空。较长的右键主菜单和飞出子菜单都会在小屏幕内滚动，Export / Select Same 这类长列表不会跑出视窗。
- 右键顶部可直接 Undo / Redo（Redo 同时显示 `Ctrl + Y` 与 Illustrator 常用的 `Ctrl + Shift + Z`）；右键、Edit 菜单、命令面板或 Properties 面板顶部可直接 Duplicate / Delete、Rename Selection；Properties 的 Object name 行还提供 Apply name / Clear name，可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行并向辅助技术读出当前动作；Lock Selection（`Ctrl + 2`）、Unlock All（`Ctrl + Alt + 2`）、Hide Selection（`Ctrl + 3`）、Hide Others 和 Show All（`Ctrl + Alt + 3`）；Layers 面板顶部也提供 Visible、Unlocked、Hide Others、Show All、Unlock All 快捷按钮，聚焦该组后可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并向辅助技术读出当前动作；并可按图层名称、对象类型或对象 ID 搜索过滤且显示匹配数量，可用 Select First 或在搜索框按 Enter 先定位第一个可见未锁定匹配项，也可按 ArrowDown 聚焦第一个匹配图层行继续方向键检查，当前行会向辅助技术读出名称、序号以及 Visible/Hidden、Locked/Unlocked 状态，随后可用 F2 重命名、V/L 显隐或锁定，或在 Select Matches / Solo Matches / Hide Matches / Lock Matches / Show Matches / Unlock Matches / Rename Matches / Duplicate Matches / Delete Matches / Clear search 搜索操作组中用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，当前搜索动作会向辅助技术读出；Assets 顶部 Import / Trace 操作组可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并向辅助技术读出当前动作，便于导入素材或直接描摹选中位图；Assets 与 Symbols 素材库也可按名称/类型/ID 搜索、用 Insert First 或在搜索框按 Enter 直接插入首个匹配项；输入搜索词后 Insert First / Clear search 搜索操作组可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并读出当前搜索动作，也可按 ArrowDown 聚焦第一个匹配 tile 先预览再插入；Assets / Symbols 网格会高亮当前键盘浏览 tile，并通过辅助技术读出名称与序号；Symbols 网格聚焦后可继续用方向键浏览符号 tile，并一键 Clear search 恢复完整符号列表；素材/符号 tile 支持键盘聚焦后按 Delete/Backspace 移除，并用 toast 确认已从库中移除，符号保存命名时，Save / Cancel 操作可用 Left/Right 或 Home/End 浏览后 Space/Enter 执行，并读出当前动作；符号还可按 F2 重命名，便于从复杂导入稿和复用素材里定位、清理库项、批量选择可编辑对象、隐藏干扰项或恢复锁定/隐藏内容。没有选区、没有锁定对象或没有隐藏对象时会提示，不会显示误导性的 0 项成功。Rename Selection / Object name 会把所选对象写入 Layers 面板名称，并立即刷新 Properties 与 Layers 面板；通过右键、Edit 菜单或命令面板重命名单个对象时会预填当前对象名称，多选时保持空白以便批量覆盖，便于整理导入图稿和复杂刻字版面。
- 左侧工具栏现在直接显示 **Measure**（`M`）和 **Eyedropper**（`I`），桌面小窗口会纵向滚动以避免底部工具被裁切；工具按钮右下角角标、hover 提示、`aria-keyshortcuts` 和命令面板工具项都会读取当前自定义工具快捷键，重绑定后立即刷新；Eyedropper 会把点击对象的填充、描边、描边宽度、透明度和文字样式复制到进入工具前的选区，按住 Alt/Option 点击则反向把当前选区外观应用到点击对象，贴近 Illustrator 的吸管工作流。
- **Select Inverse**（`Ctrl + Shift + I`）、**Select Object**（Edit 菜单、命令面板或右键）可一次反选当前可编辑对象，或选中所有文字、图像、路径或基础形状；**Select Same** 还可按填充、描边、线宽、透明度、混合模式、虚线、端点、拐角、对象类型、对象名称、字体或字号批量选择；Layers 搜索按名称 / 类型 / ID 过滤时可点 **Select Matches** 一次选中匹配的可见未锁定对象，Properties 的字体选择器也可搜索字体、显示匹配数量，Apply First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作，也可在搜索框按 Enter 将首个匹配字体应用到当前文字选区，或按 ArrowDown 聚焦首个匹配字体预览，再用 Up/Down 或 Home/End 连续浏览并立即应用到当前文字选区，当前字体行会以 aria-selected 和高亮样式标出，并向辅助技术读出字体名称与序号，仍可按 Space/Enter 确认当前字体，`Esc` 可清空搜索，方便清理导入文件、统一文字、统一叠印/混合效果或只处理某类已命名对象。
- 堆叠对象很密时，可在 Edit 菜单、命令面板或右键使用 **Select Next Object Above / Below**（`Ctrl + Alt + ]` / `Ctrl + Alt + [`）逐层切换选择。
- 右键 **Transform** 子菜单、Edit 菜单或命令面板可直接打开 Transform / Resize / Shear / Repeat；Resize 弹窗提供 Sticker label / Name badge / Yard sign / Banner panel 成品尺寸配方，可一键填入 76×51、89×38、457×305 或 610×305 mm 并解除比例锁定，也提供 Half / Original / Double 缩放预设，会按打开弹窗时的选区尺寸快速填入 50% / 100% / 200% 的宽高并保持锁定比例，聚焦 Resize 的配方或缩放预设组后可用 Left/Right 或 Home/End 浏览并立即更新字段，同时向辅助技术读出配方名称、目标宽高或无选区提示；底部 Cancel / Reset / Apply 也可用方向键浏览后再 Space/Enter 执行，并读出当前动作，Reset 会恢复打开弹窗时的选区宽高、重新锁定比例并清除旧预设播报，方便从贴纸/胸牌/横幅尺寸试验回到原始对象尺寸；Shear 弹窗提供 -30° / -15° / 0° / +15° / +30° 常用斜切角度预设，聚焦角度预设或 Horizontal / Vertical 轴向按钮后可用 Left/Right 或 Home/End 浏览并立即更新，同时向辅助技术读出当前角度或轴向；底部 Reset 会恢复 0° Horizontal 并同步角度/轴向读屏状态，方便从左右斜切或垂直斜切试验回到无斜切基准；Transform 弹窗的 mm / px 单位和 XY / Polar 移动模式按钮可用 Left/Right 或 Home/End 切换并立即更新；在 XY 模式下提供 1 / 5 / 10 / 25 当前单位的 X 方向移动预设，在 Polar 模式下同一组预设会填入 Distance，并提供 50% / 100% / 150% / 200% 缩放预设以及 -90° / -45° / 0° / +45° / +90° / 180° 旋转预设，聚焦后可用 Left/Right 或 Home/End 浏览，同时向辅助技术读出当前单位、移动模式、移动距离、缩放值或旋转角度；底部 Reset 会恢复 XY 模式、X/Y/Distance/Angle 为 0、100% 链接缩放、0° 旋转，并关闭 Apply to copy 与 Transform each，便于从连续精确变换试验回到无变换基线；Repeat 的 Grid 标签提供 2×2 / 3×3 / 5 across / 5 down 常用 Step & Repeat 网格预设，Radial 标签提供 6 around / 8 around / 12 badge 环形和徽章排版预设，Mirror 标签把 Horizontal / Vertical / Both 轴向作为可浏览预设按钮，聚焦后可用 Left/Right 或 Home/End 浏览并自动填入行列、数量、半径、角度、是否旋转副本或镜像轴向，同时向辅助技术读出当前网格行列、环形数量/半径/旋转状态或镜像轴向；Repeat 底部 Cancel / Reset / Apply 可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并读出当前动作，Reset 会恢复 Grid 标签、3×3 网格、按当前选区尺寸计算的步距、8-around 径向默认值和 Horizontal 镜像，方便从徽章环绕、长条阵列或四向镜像试验回到常用 Step & Repeat 起点；Transform / Resize / Shear / Repeat 弹窗底部 Cancel / Apply 可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，其中 Transform、Resize、Shear 和 Repeat 会向辅助技术读出当前 Cancel 或 Apply 动作；无选区时会提示，对所选可执行 Transform Again（`Ctrl + Alt + D`），或快速翻转（`Shift + H` / `Shift + V`）与 90° / 180° 旋转（同样会在无选区时提示）；右键 **Insert / Layout** 可把当前选区保存为 Symbol，也可直接插入 Star / Polygon 或打开 Split Into Grid，Star / Polygon 的 Star / Polygon / Spiral 模式标签聚焦后可用 Left/Right 或 Home/End 切换，5-point star / 6-point star / Triangle / Hexagon 常用形状预设也可用同样的方向键浏览并立即套用点数、边数或星形内半径，同时读出预设名称和关键参数；切到 Spiral 后，Gentle / Standard / Tight spiral 预设可用方向键浏览并立即套用圈数和衰减，并读出圈数与衰减；底部 Cancel / Reset / Insert 也可键盘浏览并读出当前动作，Reset 会回到默认 5-point star、5 个点和 45% 内半径，方便从多边形或螺旋试验回到常用星形；Split Into Grid 提供 Sticker sheet / Yard sign / Banner panels / Tile proof 配方，可一键套用行列数和 gutter，适合贴纸排版、庭院牌、横幅分片和分页校样；下方仍保留 1×2 / 2×1 / 2×2 / 3×2 / 3×3 常用分割预设，聚焦配方或预设组时也可用 Left/Right 或 Home/End 浏览并立即套用行列数与 gutter，同时向辅助技术读出配方名称、行列数和间距；底部 Cancel/Insert 与 Split Into Grid 底部 Cancel / Reset / Apply 都可用 Left/Right 或 Home/End 浏览后提交，Star / Polygon 会读出当前 Cancel 或 Insert 动作，Split Into Grid 会向辅助技术读出当前动作；Reset 会恢复 Sticker sheet 的 3×3 网格和 2 mm gutter，便于从庭院牌、横幅分片或分页校样试验回到常用贴纸排版。

## 路径编辑 / 变形

- 双击路径进入锚点编辑；按住 **Shift** 点击多个锚点可多选，拖动其中一个会一起移动。
- **Average Anchor Points**（`Ctrl + Alt + J`，也在右键 **Path Effects** 中）会把已多选锚点平均到同一位置，适合快速对齐路径节点。
- **Join Paths**（`Ctrl + J`，Edit 菜单、右键 **Path Effects** 和命令面板均可执行）可闭合 1 条开放路径，或连接 2 条开放路径端点，适合整理导入线稿和刻字轮廓。
- Roughen / Zig Zag / Pucker & Bloat / Twist 弹窗会在画布上显示洋红色虚线预览，取消不会改动原图形；右键 **Path Effects**、Edit 菜单或命令面板也可直接 Clean Up 导入文件中的杂散点/空文本，为开放路径添加起点/末端/双端箭头，并打开 Simplify、Round Corners、Offset Path、Arc Warp 和 Blend；Simplify / Round Corners / Offset Path 弹窗内提供常用容差、圆角半径和内外偏移预设按钮；Simplify 的容差预设、Offset Path 的内外偏移预设与 Round Corners 的半径预设聚焦后都可用 Left/Right 或 Home/End 浏览并立即更新 Tolerance/Offset 输入值或 Radius 滑杆与高亮状态；Roughen 提供 Smooth / Hand-drawn / Distressed / Rugged 配方预设并同时设置 Size 与 Detail，聚焦这些 Roughen 配方后可用 Left/Right 或 Home/End 浏览并立即载入配方、刷新画布预览，同时向辅助技术读出配方名称、Size 与 Detail；底部 Reset 会恢复默认 1 mm Size 与 3 mm Detail，并清除旧配方播报，方便从手绘、破损或粗糙边缘试验回到常用 Roughen 基线；Zig Zag 提供 Sawtooth / Burst / Wave / Scallop 配方预设并同时设置 Size、Ridges 与 Smooth，聚焦这些 Zig Zag 配方后也可用 Left/Right 或 Home/End 浏览并立即载入配方、刷新画布预览，同时向辅助技术读出配方名称、Size、Ridges 与 Corner/Smooth 状态；Pucker & Bloat 提供 -75 / -50 / -25 / 0 / +25 / +50 / +75% 常用收缩/膨胀预设，聚焦这些预设后也可用 Left/Right 或 Home/End 浏览并立即刷新画布预览，同时向辅助技术读出当前 Pucker 或 Bloat 百分比；底部 Reset 会恢复 0% 无收缩/膨胀并清除旧预设播报，方便从夸张膨胀或收缩试验回到原始路径预览；Twist 提供 -180 / -90 / -45 / 0 / 45 / 90 / 180° 常用角度预设，聚焦这些角度后也可用 Left/Right 或 Home/End 浏览并立即刷新画布预览，同时向辅助技术读出当前扭转角度；底部 Reset 会恢复 0° 无扭转并清除旧预设播报，方便从顺/逆向旋扭试验回到原始路径预览；Arc Warp 提供 -75 / -50 / -25 / 0 / +25 / +50 / +75% 常用弯曲预设，聚焦这些弯曲预设后可用 Left/Right 或 Home/End 浏览并立即更新 Bend 滑杆与高亮状态，同时向辅助技术读出当前弯曲百分比；底部 Reset 会恢复 Arc 样式和 40% 默认弯曲并清除旧预设播报，方便从 Rise / Flag / Wave 或反向弯曲试验回到常用弧形横幅；Blend 弹窗提供 3 / 5 / 10 / 20 常用步数预设，聚焦后可用 Left/Right 或 Home/End 浏览并立即更新混合步数、高亮当前按钮，同时向辅助技术读出当前步数；Multi-outline 提供 Shadow / Sticker / Team / Badge 配方预设，可同时设置轮廓数量、每圈宽度和常用颜色，聚焦配方组后用 Left/Right 或 Home/End 浏览会立即载入这些轮廓参数、更新高亮状态，并向辅助技术读出配方名称、轮廓数量和每圈宽度；Simplify / Offset Path / Round Corners、Roughen / Zig Zag / Pucker & Bloat / Twist、Arc Warp、Blend 与 Multi-outline 底部 Cancel / Reset / Apply 或 Cancel / Apply 都可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，其中 Simplify / Offset Path / Round Corners、Roughen / Zig Zag、Pucker & Bloat / Twist、Arc Warp、Blend 与 Multi-outline 会向辅助技术读出当前 Cancel、Reset 或 Apply 动作（按弹窗实际动作显示），适合快速清理导入路径、制作圆角招牌、贴纸轮廓、手绘/波浪/膨胀/扭转效果、弧形横幅、渐变混合和多层描边；需要选区的路径/变形弹窗在无选区时会提示。
- **Free Distort** 提供四角包络变形，可通过 Left perspective / Right perspective / Skew / Top taper / Bottom taper / Flag wave 预设或输入四角 ΔX / ΔY 做透视、倾斜、收窄、旗帜波形和信封变形；聚焦预设组后可用 Left/Right 或 Home/End 浏览并立即载入四角偏移、刷新预览，同时向辅助技术读出当前透视/倾斜/波形配方名称和用途，底部 Reset/Cancel/Apply 也可用方向键浏览再按 Space/Enter 执行，并向辅助技术读出当前动作；无选区时从 Edit 菜单或命令面板调用会提示。
- **Group / Ungroup / Isolation Mode**（Edit 菜单、命令面板或右键）在选区不足或未选中组时会提示；Bring to Front / Forward / Send Backward / Send to Back 等堆叠顺序命令在 Document 菜单、命令面板和右键中都显示 `Ctrl + ]/[` 与 Shift 变体；Properties → Transform 的 mm / px 单位切换可用 Left/Right 或 Home/End 浏览并立即切换输入单位；也可用 25% / 50% / 75% / 100% / 150% / 200% 快速缩放尺寸，聚焦缩放预设组时可用 Left/Right 或 Home/End 切换并应用，同时向辅助技术读出当前缩放百分比；也可点 Fit W / Fit H 让所选宽度或高度适配当前文档，或用 Fit Page 等比适配到文档内并居中，聚焦 Fit 按钮组时可用 Left/Right 或 Home/End 浏览并立即执行适宽、适高或适配页面，并读出当前 Fit 动作；Fit / Center 按钮会高亮显示当前是否已匹配文档宽高或居中状态；可用 Center X / Center Y / Center 分别水平、垂直或双向居中，聚焦 Center 按钮组时同样可用 Left/Right 或 Home/End 浏览并立即居中，并读出当前居中动作；还可用 0° / 90° / 180° / -90° 预设快速摆正或转向对象，聚焦旋转预设组时同样可用 Left/Right 或 Home/End 切换并应用，同时读出当前角度；没有选区时也会提示；Isolation Mode（`Ctrl + Alt + I`）进入组内编辑后，可用 `Esc` 或顶部徽标退出并重组。
- **Single-line Text**（`Ctrl + Alt + T`）会生成开放描线路径，适合雕刻、笔式绘图机、V-carve 和刻画机输出。**Variable Data**（`Ctrl + Alt + V`）可把选中的文字按数字序列或自定义列表复制成编号网格，Numbers / List 模式标签聚焦后可用 Left/Right 或 Home/End 切换；数字模式提供 Badges 10 / Badges 50 / Odd 25 / Tickets 100 常用序列预设，聚焦预设组时也可用 Left/Right 或 Home/End 浏览并立即套用 start / step / count / pad / columns，同时刷新生成预览，并向辅助技术读出配方名称、起始值、步进、数量、补零和列数；Columns 下方提供 2 / 3 / 4 / 5 / 10 常用列数预设，Gap X / Gap Y 下方提供 5 / 10 / 20 / 40 / 80 mm 常用间距预设，这些预设组聚焦后可用 Left/Right 或 Home/End 浏览并立即套用，且会读出当前列数、Gap 轴向、毫米值和联动状态；开启 Link gaps 时任一间距预设会同时更新 X/Y 间距；Auto gap / Link gaps 组成排版操作组，聚焦后可用 Left/Right 或 Home/End 浏览；可用 Auto gap 根据当前选中文字尺寸重新估算 X/Y 间距；Columns 旁的 Fill order 可在 Rows / Cols 之间切换，适合按行生成胸牌或按列填满标签纸，聚焦该组时同样可用 Left/Right 或 Home/End 切换；列表模式提供 Sample list / Clean list / Dedupe / Sort A-Z / Reverse / Clear list，用于粘贴名单后快速清理空白、逗号分隔、重复项、排序或倒序输出，聚焦列表操作组时也可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前列表整理动作；Generation preview 会在生成前显示前几个编号/名单值、总数和预计网格行列，并向辅助技术读出当前 Numbers/List 来源模式、值数量、网格尺寸和示例值，避免批量胸牌或票券输出前填错序列；底部 Cancel/Generate 可用 Left/Right 或 Home/End 浏览后再 Space/Enter 执行，并向辅助技术读出当前生成动作，适合胸牌、门牌、流水号、票券和贴纸批量排版。
- 选中文字后可用 **Type** 菜单、命令面板或右键 **Type** 子菜单执行转曲线（Create Outlines，`Ctrl + Shift + O`）、Break Text（Letters `Ctrl + Alt + L` / Lines `Ctrl + Alt + Shift + L`）、Text on Arc（Up `Ctrl + Alt + A` / Down `Ctrl + Alt + Shift + A`）、Change Case（UPPER `Ctrl + Alt + U` / lower `Ctrl + Alt + Shift + U` / Title `Ctrl + Alt + Shift + T` / Sentence `Ctrl + Alt + Shift + S`）、Smart Punctuation（`Ctrl + Alt + Q`），以及字号、字距、行距快速微调，其中字距/行距的 Alt+方向键也已进入 Help → Customize Shortcuts，可改键并会同步显示在菜单、右键和命令面板；字体选择器支持搜索后用 Apply First / Clear search 搜索操作组（Left/Right 或 Home/End 浏览并读出当前动作）或 Enter 应用首个匹配字体，若搜索没有命中，空状态会直接显示 Clear search 恢复按钮，也可在字体预览列表用 Up/Down 或 Home/End 浏览并立即应用到当前文字选区，当前字体行会高亮，仍可按 Space/Enter 确认当前字体；Character 面板的 Size 下方提供 12 / 18 / 24 / 36 / 48 / 72 / 96 / 144 / 216 常用字号预设，Tracking 有 tight / normal / loose / wide 一键值，Leading 也有 0.9 / 1 / 1.16 / 1.5 / 2 常用行距预设，H% 旁提供 75 / 85 / 100 / 115 / 125% 横向压缩/拉伸预设，V% 旁提供 75 / 100 / 125% 纵向比例预设，这些文字预设组都可用 Left/Right 或 Home/End 从键盘直接切换并应用，其中字号、Tracking、Leading、H% 和 V% 预设获得焦点或方向键浏览时会向辅助技术读出当前字号、字距、行距或缩放百分比；右键 **Type → Single-line Text…**、命令面板或 `Ctrl + Alt + T` 可快速创建雕刻/笔式输出用单线文字，弹窗提供 Engraving / Badge / Serial / Pen plot 预设，可一键套用示例文字、字号和字距，聚焦预设组后可用 Left/Right 或 Home/End 浏览并立即载入文字、字号和字距，同时向辅助技术读出配方名称、示例文字、字号和字距；字段操作提供 Reset fields / Clear text，可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行并读出当前动作，便于连续制作铭牌或清空旧文本；底部 Cancel/Create 可用 Left/Right 或 Home/End 浏览后再 Space/Enter 执行，并向辅助技术读出当前动作；**Find & Replace…**（`Ctrl + Alt + F`）可直接打开全局文字替换，在 Find 或 Replace 输入框中按 Enter 可立即执行 Replace All，也可用 ArrowDown 从 Find 跳到 Replace、ArrowUp 从 Replace 回到 Find；弹窗提供 Double spaces / Dash cleanup / Number token / Brand mark 配方，可一键填入常见文案清理、编号占位符或商标符号替换规则，聚焦配方组后可用 Left/Right 或 Home/End 浏览并立即填入 Find / Replace / Match case，同时更新匹配数，当前配方会向辅助技术读出名称、序号和用途说明；也可用 Clear fields 清空字段或 Swap find/replace 交换查找/替换词，聚焦这些字段操作时同样可用方向键浏览并向辅助技术读出当前动作；底部 Cancel / Reset / Replace All 同样可用 Left/Right 或 Home/End 浏览，并读出当前动作；Reset 会清空 Find / Replace、关闭 Match case、清除旧配方/字段播报并把焦点送回 Find，方便连续试验清理规则后安全回到空白查找。
- **Freeform Gradient** 可从右键 **Edit Colors** 或命令面板搜索打开，会生成可导出的栅格自由渐变，用作浏览器不支持 SVG mesh gradient 时的可靠替代，并可通过 Poster glow / Neon sign / Metal plate / Heat map 快速起稿海报、招牌、铭牌或贴花背景；聚焦配方预设后用 Left/Right 或 Home/End 浏览会立即载入对应尺寸和全部色标，并读出当前配方用途、尺寸与色标数量。
- 导入位图后可从 Document → **Image**、右键 **Image Filters** 或命令面板搜索 Image Filters / Trace Image，快速描摹位图、栅格化选区，或应用 Blur、Sepia、Grayscale、Brightness、Contrast、Hue rotate 并清除滤镜；Properties → Filters 的快速按钮会同步更新自定义 Blur/Bright/Contrast/Hue 滑杆读数，并提供带高亮状态的模糊、亮度、对比度、色相常用强度按钮，聚焦这些强度预设组时可用 Left/Right 或 Home/End 切换并应用，同时向辅助技术读出当前模糊、亮度、对比度或色相值，Clear Image Filters 也会清空这些滑杆。
- 渐变属性面板会从当前选中的渐变填充对象读回类型、角度和色标；线性渐变角度提供 0° / 45° / 90° / 135° / 180° / 270° 预设，聚焦该预设组时可用 Left/Right 或 Home/End 切换并应用，同时向辅助技术读出当前角度，方便继续编辑。
- 右键 **Edit Colors**、Edit 菜单或命令面板可直接重新着色、反相、灰度化、调整饱和度/色相/亮度或生成自由渐变；需要选区的颜色弹窗在无选区时会提示。

---

## 文件管理

| 想做的事 | 用哪个 |
|---|---|
| 完整工程往返 | `.vstudio.json`（含画板 / 符号 / 文档设置） |
| 跟设计师协作 | SVG（贝塞尔无损） |
| 给非矢量工具 | PNG 2× DPI |
| 从画布开始文件操作 | 右键 **File / Import** 可 New（`Ctrl + N`，可在 Customize Shortcuts 改键并同步显示到 File 菜单 / 命令面板 / 右键）/ New from Template（`Ctrl + Alt + N`，同样可改键并同步显示）/ Open SVG or JSON / Import Image（`Ctrl + Alt + Shift + I`，同样可改键并同步显示）/ Open Project（`Ctrl + Alt + O`，可改键并同步显示）/ Save Project / Save Project As（`Ctrl + Alt + Shift + P`，可改键并同步显示），且 Open / Save / Export / Print / Tile / Plotter 这类文件与输出命令在 File 菜单、命令面板和右键里都会读取当前自定义绑定；并可打开/清空 Recent Files；New from Template 弹窗可按模板名称、尺寸、用途或 ID 搜索并显示匹配数量，并可用 All / Business / Social / Logo / Print / Stickers 类别芯片快速筛选，类别芯片会显示数量、支持 Left/Right 或 Home/End 键盘浏览，并向辅助技术读出当前类别；筛选后搜索摘要会按当前类别显示命中数，避免把分类内结果误读成全库结果；若搜索和类别组合没有结果，空状态会提供 Clear search / Show all categories / Reset filters 恢复按钮，同样可用 Left/Right 或 Home/End 浏览并读出当前动作 |
| 从系统剪贴板导入 | 右键 **Paste from Clipboard** 或命令面板，支持剪贴板中的 SVG / 图片 |
| 只交付当前图形 | 右键 **Export** → Export Selection as SVG / PNG，或 **Copy as SVG** 粘到代码/设计工具 |
| 印刷 / 刻画输出 | PDF（矢量）+ Print Prep（裁切线 / 出血）；顶部栏的 Plotter / Contour / Reg / Weed / Bridge / Grommet / Stone / Data / Test / Nest / Print / Prep / Tile / Export / Document Settings / AI 输出操作组成键盘可浏览且可横向滚动的工具条，可从生产输出区直接打开 Variable Data 做胸牌、票券或序列贴纸排版，也可用 `Ctrl + Alt + V` 直达，聚焦其中任一按钮后可用 Left/Right 或 Home/End 移动到相邻输出动作再按 Space/Enter 执行；Print 和 Tile Print 弹窗的 A4/A3/Letter/Legal 页面尺寸都可搜索并显示尺寸与匹配数量，Use First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前搜索动作；若页面尺寸搜索没有命中，空状态会直接显示 Clear search 恢复按钮；也支持在搜索框按 Enter 套用首个匹配、按 ArrowDown 聚焦第一个页面尺寸继续键盘选择，进入页面尺寸列表后可用方向键或 Home/End 浏览并套用尺寸，当前纸张会向辅助技术读出名称与序号，`Esc` 清空，且 Orientation 都使用带高亮状态的 Portrait / Landscape 按钮，聚焦按钮组后可用 Left/Right 或 Home/End 切换；Print 弹窗顶部提供 Proof / Office / Photo fill / True size 打印作业预设，可一键套用页面尺寸、方向、缩放模式和边距，聚焦后可用 Left/Right 或 Home/End 浏览并立即更新预览与 Ready to print 摘要，同时向辅助技术读出预设名称、页面、方向、缩放和边距；Print 的 Scaling 使用 Actual size / Fit to page / Fill page 高亮按钮，也支持同样的方向键切换；底部会先显示 **Ready to print** 摘要，集中确认页面尺寸、方向、缩放模式、边距、出血和 Crop / Registration / Page info 标记；Cancel / Reset / PDF / Print 输出动作组成键盘可浏览按钮组，可用 Left/Right 或 Home/End 移动焦点并向辅助技术读出当前动作，再按 Space/Enter 执行；Reset 会恢复 A4 纵向、Fit、10 mm 边距和默认 Print Prep，关闭 Prep 详情并清空页面尺寸搜索，方便试验 proof/press/photo 设置后安全回到标准打印状态；Margin 下方提供 0 / 3 / 5 / 10 / 15 / 25 mm 常用边距预设，聚焦边距预设组后可用 Left/Right 或 Home/End 切换，当前边距会向辅助技术读出；Tile Print 提供 Auto / Selected / Visible / Canvas 来源按钮，可用 Left/Right 或 Home/End 切换；Selected 没有可用选区或 Visible 没有可见图稿时会高亮并使用下一个可用来源，避免按钮状态与实际输出范围不一致；Columns / Rows 下方提供 Auto Grid 自动估算列/行，开启后会保持高亮并在来源、纸张方向、页面尺寸、重叠或页边距变化时按当前来源范围和扣除页边距后的可打印区域重新估算；手动修改 Columns / Rows 或点击固定网格预设会退出自动网格；Auto 来源会优先选中图稿、未选中时使用可见图稿，避免整张画布空白影响分页；Proof / Poster / Banner 分页作业预设可一键套用网格、重叠和页边距组合，适合校样、小海报和横幅拼接；Auto Grid、1×1 单页校样以及 1×2、2×1、2×2、3×2、3×3 常用分页网格预设位于同一个工具栏，聚焦作业预设或网格预设后都可用 Left/Right 或 Home/End 在自动估算和固定网格间浏览并按 Space/Enter 套用，同时向辅助技术读出作业名称、网格、页数、重叠和页边距，或当前网格与总页数；摘要中显示来源、总页数、单页尺寸、页边距、可打印区和拼接后尺寸，预览中会用粉色标示重叠带、绿色虚线框显示每张 tile 的实际可打印区，标题旁的图例会解释 Overlap / Printable 标记，Overlap 下方提供 0 / 5 / 10 / 15 / 20 mm 拼接重叠预设，Margin 提供 0 / 3 / 5 / 10 / 15 mm 分页内侧空白预设，打印时每页会保留该空白边距便于裁切、贴合和家用打印机不可打印区域；聚焦分页网格、Overlap 或 Margin 预设组时可用 Left/Right 或 Home/End 切换，Overlap / Margin 当前预设值会向辅助技术读出；Tile Print 底部会先显示 **Ready to tile print** 摘要，集中确认图稿来源、页面尺寸、方向、分页网格、总页数、重叠、页边距、单页尺寸和拼接后尺寸，Cancel / Reset / Print 输出动作也组成键盘可浏览按钮组，可用 Left/Right 或 Home/End 移动焦点并向辅助技术读出当前动作，再按 Space/Enter 执行；Reset 会恢复 A4 纵向、1×1 proof 分页、0 mm 重叠、5 mm 页边距、Auto 来源并清空页面尺寸搜索，方便从海报/横幅拼接试验安全回到单页校样；Print Prep 展开后可用 Proof / Press / Sticker / None 一键套用校样、印刷、贴纸或无印前标记设置，聚焦印前预设或 Bleed 的 0 / 1 / 2 / 3 / 5 / 10 mm 常用出血预设组后也可用 Left/Right 或 Home/End 切换，当前印前配方会读出预设名称、出血和 Crop / Registration / Page info 标记，当前出血值也会读出；Send to Plotter 的材料预设搜索若没有命中，空状态会直接显示 Clear search 恢复按钮，便于快速回到完整材料列表；File 菜单、命令面板或右键 **Print / Output** 可直接打开 Print Prep，也可用 `Ctrl + P` Print、`Ctrl + Alt + P` Tile Print、Auto-arrange (Nest)、Add/Clear positioning marks、Add/Clear weed borders、Banner Grommets、Save Test Cut File 或 Send to Plotter |
| 给 CNC / 激光 | G-code |
| 给乙烯刻字机 | HP-GL |
| 给 CAD | DXF（File 菜单、右键 **Export** 或命令面板搜索 **Export DXF**） |
| 备份 / 自动化交换 | JSON（File 菜单、右键 **Export** 或命令面板搜索 **Export JSON**） |

### 刻字 / 轮廓切割

- 选中图形后可从 Document 菜单、右键 **Cut prep → Cut Contour…**（默认 `Ctrl + Shift + C`，可在 Customize Shortcuts 改键并同步显示到 Document 菜单、顶部 Contour、命令面板和右键）或命令面板搜索 **Cut Contour…** 打开多标签套件；标签页聚焦时可用 Left/Right 或 Home/End 在 Outline / Trace Bitmap / Reg Marks 之间切换，左侧调偏移 / 描摹 / 对位标记，右侧会实时显示应用替换/追加设置后的最终刻画作业，并用粉色摘要提示将替换多少旧轮廓/描摹/对位路径或将追加新路径，便于确认旧轮廓或旧描摹线是否会被保留。Outline 页提供 Kiss-cut、Sticker bleed、Wide decal、Inside cut、Heavy material 预设，可一键联动偏移量和切割次数；默认勾选 **Replace existing contour paths**，重复试偏移时会替换旧轮廓但保留描摹线和对位标记，取消勾选则把新轮廓追加到当前刻画作业；Trace Bitmap 页提供 Logo、Dark art、Photo high contrast、Transparent PNG、Noisy scan 预设，可一键调整阈值、简化精度和 Alpha 通道，默认 **Replace existing trace paths** 会在反复调阈值/简化时替换旧描摹线但保留手动轮廓和对位标记，取消勾选则可追加多次描摹结果做对比或复合切线；Reg Marks 页提供 Roland standard、Graphtec scan、Outside bleed、Compact sheet、Long banner 预设，三组预设聚焦后都可用 Left/Right 或 Home/End 浏览并立即套用参数，当前轮廓/描摹/对位标记预设会向辅助技术读出名称和关键参数；底部可按类型单独 Clear contour、Clear trace、Clear regmarks，也可 Clear all，聚焦清理按钮组时可用 Left/Right 或 Home/End 浏览后 Space/Enter 执行，并向辅助技术读出当前清理动作；Close / Send to Plotter 输出动作也支持同样的方向键浏览并读出当前动作，便于重复试轮廓、描摹或对位参数而不清空整份刻画作业。
- **Reg Marks** 标签页会在放置前预览 4 角对位标记的位置，并提供 Roland standard、Graphtec scan、Outside bleed、Compact sheet、Long banner 预设，一键联动臂长和 X/Y 内缩，适合先确认是否压到图稿、出血或纸张边缘。
- **Send to Plotter / Cutter**（`Ctrl + Shift + P`）默认显示图形化刻画预览，可切换 Code 查看 HP-GL / G-code，预览模式 tab 聚焦时可用 Left/Right 或 Home/End 在 Outline 与 Code 间切换；Format、HP-GL 方言、Unit 与 Origin 使用带状态高亮的 HP-GL / G-code、Bare / Roland / Graphtec、mm / inches、Top-left / Bottom-left 按钮，聚焦这些按钮组时也可用 Left/Right 或 Home/End 直接切换，避免出刀前误选输出类型、刻字机封装命令、单位或坐标原点；材料预设以可视卡片显示 feed / force / speed / overcut 摘要，可按材料名、参数、ID 或 HTV/mirror 搜索并显示匹配数量，Use First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，也可在搜索框按 Enter 立即套用首个匹配材料，或按 ArrowDown 聚焦材料列表后用方向键 / Home / End 浏览并套用材料，当前材料会向辅助技术读出名称与序号；Feed / Travel 下方提供 200 / 400 / 800 / 1200 和 800 / 1200 / 2000 / 3000 常用速度预设，Curve tolerance 下方提供 0.25 / 0.5 / 1 / 2 px 精度预设，Overcut 也提供 0–1 mm 常用预设；聚焦这些预设组时可用 Left/Right 或 Home/End 切换，当前速率、容差或 overcut 预设值会向辅助技术读出，便于在测试切、精细图形、平滑曲线、过切补偿和快速走刀之间不用鼠标来回调整；预览支持带状态高亮的打印图叠加与切割顺序编号按钮，聚焦这组预览开关时可用 Left/Right 或 Home/End 浏览再按 Space/Enter 开关，并读出 Show print / Cut order 当前开关状态；带状态高亮的 Mirror / Optimize / Reverse / Inner-first 切割策略按钮，聚焦切割策略组时可用 Left/Right 或 Home/End 在策略之间移动并立即开关，并读出当前策略名称与 on/off 状态，过切预设和颜色分色，颜色分色区可用带状态高亮的 All colors / No colors / Invert / Next color，聚焦这些快捷按钮时可用 Left/Right 或 Home/End 浏览并读出将启用的颜色数量或下一种 solo 颜色，再按 Space/Enter 执行，配合每个色块旁带高亮状态的 Only 在多色乙烯中逐色输出；若 No colors 导致没有启用的刻字路径，底部会显示警告并禁用 Save / Send，并可在弹窗内直接 Test cut、Add/Clear positioning marks、Add/Clear weed borders，并用 None / Rows / Columns / 2×2 / 3×2 排废网格预设切分大面积废料，或用 None / Light / Standard / Heavy 桥接预设给闭合刻字路径留不切断连接点，选择 None 时 Add bridges 会保持禁用以避免误以为空操作已生效，并可直接 Clear bridges 恢复闭合路径，也可用 Reset output settings 恢复默认输出参数、清空材料搜索/分色过滤/排废网格/桥接预设并回到 Outline 预览，或用 Clear cut paths 清空整份刻画作业；聚焦 Weed border / Add positioning marks / Clear weed borders / Clear positioning marks / Clear contour / Clear trace / Clear regmarks / Clear cut paths / Reset output settings 生产准备动作组，或 Add bridges / Clear bridges 桥接动作组时，可用 Left/Right 或 Home/End 浏览并向辅助技术读出当前动作；聚焦排废网格或桥接预设组时同样可用 Left/Right 或 Home/End 切换，当前预设会向辅助技术读出行列或桥接数量/间隙，便于连续试排废/桥接方案；Plotter 弹窗底部会先显示 **Ready to output** 摘要，集中确认格式、输出来源、路径数、颜色过滤、HP-GL 方言 / 单位 / 原点 / 镜像状态、材料、Feed / Travel、Graphtec Force / Speed、过切和预计时间；Cancel / Test cut / Save File / Send via USB 输出动作也组成键盘可浏览按钮组，可用 Left/Right 或 Home/End 移动焦点并读出当前动作、文件名、阻塞原因或发送摘要，再按 Space/Enter 执行；File 菜单、右键 **Print / Output** / **Cut prep** 和命令面板也提供 **Auto-arrange (Nest)**、**Banner Grommets** 与 **Save Test Cut File**，可在输出前先把多个对象紧凑排料、给横幅加气眼切孔，或保存 HP-GL 校准小图给任意刻字机软件测试刀压/偏移。
- 底栏右侧的画板翻页、粉色剪刀刻字计数、Grid / Snap / Guides / Anchor 开关和版本入口组成键盘可浏览状态操作组，聚焦其中任一按钮后可用 Left/Right 或 Home/End 移动焦点再按 Space/Enter 执行；粉色剪刀计数表示文档已有刻字路径，点击可直接打开 **Send to Plotter / Cutter**，Shift/Alt 点击则回到 **Cut Contour…** 调整轮廓，Ctrl/Cmd 点击会直接 Clear cut paths 并显示确认 toast，方便发现错误刻画作业后不用进菜单即可清空。
- 分色刻字时，**Cut by color** 行可用 All colors / No colors / Invert / Next color 快速切换颜色，也可点某个色块旁的 **Only** 只输出该颜色。
- File 菜单、Document 菜单、右键画布的 **Cut prep** 子菜单和命令面板都提供 2 mm 快速轮廓、焊接刻字路径、描边边缘转刻字路径、Add/Clear positioning marks、Add/Clear weed borders、可搜索的 Rows / Columns / 2×2 / 3×2 排废网格预设、Light / Standard / Heavy 桥接预设和 Clear bridges 恢复闭合路径、Banner Grommets、Save Test Cut File、显示/隐藏预览、清空刻字路径和发送刻画机；Document 菜单、命令面板、右键 Cut prep 和 Send to Plotter / Cutter 里也可单独 Clear contour、Clear trace 或 Clear regmarks，也可 Clear cut paths 一键清空整份刻画作业，避免回到轮廓窗口重做清理；顶部输出工具条的 Bridge 会直接套用 Standard 桥接，旁边 Clear 可立即 Clear bridges 恢复闭合路径；右键 **Print / Output** 也可先 Auto-arrange (Nest)，再直接添加或清除对位标记 / 排废边框 / 桥接 / 整份刻画路径 / 常用排废网格、生成横幅气眼并保存测试切割文件，Banner Grommets 弹窗内的小横幅 / 标准横幅 / 大横幅预设可用 Left/Right 或 Home/End 浏览并立即套用参数，同时向辅助技术读出预设名称、内缩、最大间距和孔径，也可按 Space/Enter 再确认当前按钮；File 菜单、命令面板和右键 Cut prep / Print / Output 也提供这些气眼预设，可不打开弹窗直接生成常用横幅孔位，底部 Cancel / Reset / Apply 也可键盘浏览，并向辅助技术读出当前动作；Reset 会恢复标准横幅的 20 mm 内缩、500 mm 最大间距和 10 mm 孔径，便于从小横幅/大横幅试验回到常用生产参数；Rhinestone Template 弹窗的 Fine / Standard / Bold 作业预设可同时套用钻石直径与间距，SS6 / SS10 / SS16 / SS20 钻石尺寸预设和 Dense / Standard / Loose 间距预设也都可用 Left/Right 或 Home/End 浏览并立即套用当前尺寸或间距，并向辅助技术读出作业名称、钻石直径或间距，也可按 Space/Enter 再确认当前按钮；File 菜单、命令面板和右键 Sign Effects 也提供 Fine / Standard / Bold stones 烫钻预设，可不打开弹窗直接生成常用热转钻模板，底部 Cancel / Reset / Apply 也可用 Left/Right 或 Home/End 浏览后再 Space/Enter 执行，并向辅助技术读出当前动作；Reset 会恢复 Standard stones 的 SS10 2.8 mm 钻石和 4 mm 标准间距，适合从精细/醒目烫钻试验回到常用热转模板参数。
- 右键菜单也提供 **Rasterize**，方便在不进菜单栏的情况下把选中对象转成位图。

**自动保存**：每隔 ~5 秒写入 localStorage。崩溃后下次打开会弹 RecoveryDialog 让你选择恢复；底部 Discard / Restore 可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，当前动作会向辅助技术读出，`Esc` 等同丢弃。
**Recent Files**：File 菜单底部、命令面板和右键 **File / Import** 都能打开最近项目；Web 版会提示你在系统选择器里重新选择同名文件，也可清空列表。

---

## 画板（Artboards）

- 一个文件可以有多个画板（每个画板 = 一个独立的 "页面"）
- 画板内 = 亮色 paper，画板外 = 暗色 scratch
- 右侧 **画板面板** 列出所有画板，可按画板名称、尺寸或 ID 搜索过滤并显示匹配数量，Target First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前搜索动作；若画板搜索没有命中，空状态会直接显示 Clear search 恢复按钮；也可在搜索框按 Enter 直接缩放定位到首个匹配画板，或按 ArrowDown 先聚焦首个匹配画板行，再用 Up/Down 或 Home/End 连续浏览画板行，当前行会保持高亮并向辅助技术读出画板名称、序号和像素尺寸，或点单行 Target 图标定位到某个画板；每个画板行可用键盘聚焦后按 Enter 定位、Ctrl/Cmd+D 复制、Delete/Backspace 删除、R 宽高互换；行内还提供 A4 / Letter / 24×12 in 尺寸预设、Swap W/H 宽高互换，以及 Fit Selection / Fit Artwork 按钮；聚焦尺寸预设组后可用 Left/Right 或 Home/End 浏览并立即套用 A4 / Letter / 24×12 in 尺寸，并读出当前尺寸预设；Swap W/H 仍按 Space/Enter 确认并会读出当前动作；Fit 组可用 Left/Right 或 Home/End 浏览再按 Space/Enter 执行，并读出 Fit Selection 或 Fit Artwork，可直接让指定画板适配当前选区或全部内容，便于快速切换印刷页、贴纸页或横幅/刻字版面的横竖方向和内容边界
- **Layers** 面板每行可直接显示/隐藏、锁定/解锁、复制或删除对象，选中或键盘聚焦的行会保持复制/删除按钮可见，也可在图层列表里用方向键定位后按 `F2` 重命名、`Ctrl/Cmd + D` 复制、`V` 显示/隐藏、`L` 锁定/解锁、`Delete` 或 `Backspace` 删除并保留撤销历史，双击名称同样可重命名，拖拽行可调整堆叠顺序；顶部搜索可按名称、类型或对象 ID 过滤并显示匹配数量；若搜索没有命中，空状态会直接显示 Clear search 恢复按钮；输入筛选词后可 Select First / Select Matches，也可在搜索框按 ArrowDown 聚焦第一个匹配图层行继续键盘检查；搜索操作按钮组可用 Left/Right 或 Home/End 浏览，并向辅助技术读出当前动作，再执行 Solo Matches 只显示当前搜索命中的对象，或用 Hide Matches / Lock Matches / Show Matches / Unlock Matches 批量隐藏、锁定、恢复显示或解锁匹配图层，也可用 Rename Matches 一次把当前搜索命中的对象批量命名或在输入空白时清空名称，用 Duplicate Matches 偏移复制当前搜索命中的对象并自动选中新副本，或用 Delete Matches 删除当前搜索命中的对象；Delete Matches 会先弹出危险操作确认，避免误删导入稿里的正文或切割线；这些按钮会按当前搜索结果里实际可选择、可隔离、可隐藏、可锁定、可恢复、可解锁、可重命名、可复制或可删除的对象自动禁用，适合清理复杂导入文件、隐藏参考图、复制一组同名标签/切线、删除临时标注或锁定切割辅助线。
- **Document** 菜单、命令面板和右键画布的 **Artboard** 子菜单都可打开 Document Settings / New from Template，从所选创建画板，或让当前画板适配所选/全部内容；Document Settings 的预设尺寸可按名称、分类、尺寸或 ID 搜索并显示匹配数量，Use First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作；若预设尺寸搜索没有命中，空状态会直接显示 Clear search 恢复按钮；也能在搜索框按 Enter 立即套用首个匹配尺寸，或按 ArrowDown 直接聚焦预设下拉列表继续选择；Portrait / Landscape 方向按钮聚焦后可用 Left/Right 或 Home/End 切换并读出当前方向，底部 Cancel / Reset / Apply 可用 Left/Right 或 Home/End 浏览后再 Space/Enter 执行，并读出当前动作；Reset 会恢复打开弹窗时的文档宽高、DPI、背景和方向，并清空预设搜索，方便从 A4、Letter、贴纸或屏幕尺寸试验回到原文档设置；模板弹窗打开后会自动聚焦搜索框，同样支持搜索，Use First / Clear search 搜索操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作，也可按 Enter 套用首个结果、ArrowDown 直接聚焦首个模板 tile，聚焦模板网格后可继续用方向键浏览模板，当前模板会保持高亮并向辅助技术读出名称与序号，再按 Enter 套用；右侧素材/符号库在搜索后也可用 Left/Right 或 Home/End 浏览 Insert First / Clear search 搜索操作，或按 ArrowDown 聚焦首个 tile，再用 Left/Right/Up/Down 或 Home/End 浏览素材与符号，当前 tile 会保持高亮并读出名称/序号，按 Enter 插入、Delete 删除（符号还支持 F2 重命名）；若资产或符号搜索没有命中，空状态会直接显示 Clear search 恢复按钮，不必回到搜索框手动删除；保存新符号时 Save / Cancel 可用 Left/Right 或 Home/End 浏览，且支持 Clear 和空结果提示，方便快速找到并套用名片、贴纸、海报等起稿版式
- 底栏右下角 `< N/M >` 翻页器（仅当画板 >1）

---

## 主题 / 无障碍

- **深色（默认） / 浅色 / 高对比** 三套主题，WCAG 2.1 AA 双主题验证；Help 菜单、右键 Help / Settings 和命令面板都会在高对比开启时显示 Disable High Contrast。
- 系统级 `prefers-color-scheme` 首次启动自动遵循
- 所有对话框 Esc 关闭，焦点自动回到唤出按钮
- 全键盘可达：菜单栏、工具栏、图层面板都支持 Tab / 方向键；Help Center 搜索后的 Open First / Clear search 操作可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，并向辅助技术读出当前动作，同时保留 Enter 打开首个结果、ArrowDown 聚焦首个主题、Up/Down/Home/End 浏览主题列表，当前主题会读出标题、序号和分类；若 Help Center 搜索没有命中，空状态会直接显示 Clear search 恢复按钮；首次打开的新手引导底部分页点和 Back / Next / Get Started 可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行，当前页点或动作会向辅助技术读出；AI 面板顶部 MCP / Settings / Close、快捷提示、Vision / SVG 上下文开关、Send，以及 AI 设置与 MCP Servers & Skills 弹窗中的 Cancel / Save、Refresh / + Add 操作组也可用 Left/Right 或 Home/End 浏览后按 Space/Enter 执行；在提示词输入框内方向键仍保留原生光标移动。
- `prefers-reduced-motion` 被尊重 —— OS 设置「减少动效」后所有动画关闭

---

## 数据隐私

- **AI 调用**：直连 Anthropic API。你的 API key 只在 localStorage 里。生产部署建议改走代理。
- **MCP 远程服务**：你自己添加的服务器 URL，调用走你的浏览器直连；MCP 弹窗顶部 Refresh / + Add、每行服务器的 Test / Remove，以及底部 Cancel / Save 均可键盘浏览，方便在无鼠标环境下刷新工具、测试或删除服务器、添加服务器并保存。
- **自动保存**：仅写 localStorage，不上云。

---

## 下一步

- **完整快捷键** → 按 `?`
- **每个功能的详细说明** → 按 `F1`
- **想看源码** → README.md「Architecture」一节

需要 .pit 刻字机格式 / 多人协作 / 云同步等更高级特性，请提 issue。
