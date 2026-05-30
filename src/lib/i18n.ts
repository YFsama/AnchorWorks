/**
 * Tiny i18n for Anchorworks
 * ---------------------------------------------------------------
 * USAGE
 *   • In React components:
 *        const t = useT();              // subscribes to language changes
 *        return <button>{t('Cancel')}</button>;
 *   • In non-React code (one-shot reads):
 *        import { t } from './i18n';
 *        const label = t('Cancel');
 *
 * ADDING A NEW LANGUAGE
 *   1. Extend the `Lang` type union below, e.g. `'en' | 'zh' | 'ja'`.
 *   2. Append the same key to the `LANGUAGES` tuple.
 *   3. For every entry in the `dict` object below, add a value for the
 *      new key. Untranslated keys gracefully fall back to the English key
 *      itself (which IS the dictionary key), so partial translations work.
 *   4. (Optional) extend the language switcher in `MenuBar.tsx` to show
 *      a label for the new locale.
 *
 * KEY CONVENTION
 *   Keys are the English source string verbatim. This keeps lookups
 *   readable in JSX (`t('Fill')` rather than `t('properties.fill')`) and
 *   means an unknown key still renders sensibly in English.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const LANGUAGES = ['en', 'zh'] as const;
export type Lang = (typeof LANGUAGES)[number];

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'vector.lang',
      storage: createJSONStorage(() => localStorage),
      // Persist only the language preference itself.
      partialize: (s) => ({ lang: s.lang }),
    },
  ),
);

// Dictionary: English key → translation map per locale.
// Missing entries fall back to the key (English).
const dict: Record<string, Record<Lang, string>> = {
  // -------- App identity --------
  'Anchorworks': { en: 'Anchorworks', zh: 'Anchorworks' },

  // -------- Menus: top-level --------
  'File': { en: 'File', zh: '文件' },
  'Edit': { en: 'Edit', zh: '编辑' },
  'View': { en: 'View', zh: '视图' },
  'Document': { en: 'Document', zh: '文档' },
  'Help': { en: 'Help', zh: '帮助' },

  // -------- File menu items --------
  'New': { en: 'New', zh: '新建' },
  'New from Template…': { en: 'New from Template…', zh: '从模板新建…' },
  'Open SVG / JSON…': { en: 'Open SVG / JSON…', zh: '打开 SVG / JSON…' },
  'Import Image…': { en: 'Import Image…', zh: '导入图像…' },
  'Export SVG': { en: 'Export SVG', zh: '导出 SVG' },
  'Export PNG (2×)': { en: 'Export PNG (2×)', zh: '导出 PNG (2×)' },
  'Export JPG (2×)': { en: 'Export JPG (2×)', zh: '导出 JPG (2×)' },
  'Export PDF': { en: 'Export PDF', zh: '导出 PDF' },
  'Export DXF (paths)': { en: 'Export DXF (paths)', zh: '导出 DXF (路径)' },
  'Export JSON': { en: 'Export JSON', zh: '导出 JSON' },
  'Print…': { en: 'Print…', zh: '打印…' },
  'Tile Print…': { en: 'Tile Print…', zh: '分页打印…' },
  'Send to Plotter…': { en: 'Send to Plotter…', zh: '发送到绘图仪…' },
  'Clear canvas?': { en: 'Clear canvas?', zh: '清空画布？' },
  'Tile columns': { en: 'Tile columns', zh: '分页列数' },
  'Tile rows': { en: 'Tile rows', zh: '分页行数' },

  // -------- Edit menu --------
  'Undo': { en: 'Undo', zh: '撤销' },
  'Redo': { en: 'Redo', zh: '重做' },

  // -------- View menu --------
  'Zoom In': { en: 'Zoom In', zh: '放大' },
  'Zoom Out': { en: 'Zoom Out', zh: '缩小' },
  'Fit to Page': { en: 'Fit to Page', zh: '适合页面' },

  // -------- Document menu --------
  'Document Settings…': { en: 'Document Settings…', zh: '文档设置…' },

  // -------- Help menu --------
  'Onboarding…': { en: 'Onboarding…', zh: '新手引导…' },
  'Keyboard Shortcuts': { en: 'Keyboard Shortcuts', zh: '键盘快捷键' },
  'About': { en: 'About', zh: '关于' },

  // -------- MenuBar buttons / toggles --------
  'Grid': { en: 'Grid', zh: '网格' },
  'Snap to Grid': { en: 'Snap to Grid', zh: '吸附到网格' },
  'Smart Guides': { en: 'Smart Guides', zh: '智能参考线' },
  'Anchor': { en: 'Anchor', zh: '锚点' },
  'ANCHOR': { en: 'ANCHOR', zh: '锚点' },
  'Snap to anchor points': { en: 'Snap to anchor points', zh: '吸附到锚点' },
  'Fit': { en: 'Fit', zh: '适合' },
  'Debug': { en: 'Debug', zh: '调试' },
  'Plotter': { en: 'Plotter', zh: '绘图仪' },
  'Print': { en: 'Print', zh: '打印' },
  'Save as vector PDF (skips the system print dialog)': {
    en: 'Save as vector PDF (skips the system print dialog)',
    zh: '保存为矢量 PDF（跳过系统打印对话框）',
  },
  'Export': { en: 'Export', zh: '导出' },
  'AI': { en: 'AI', zh: 'AI' },
  'Language': { en: 'Language', zh: '语言' },
  'English': { en: 'English', zh: 'English' },
  '中文': { en: '中文', zh: '中文' },

  // -------- About dialog --------
  'Version': { en: 'Version', zh: '版本' },
  'An AI-assisted vector editor built with Fabric.js, React, and Tailwind. AI features powered by Anthropic. Source managed with Git.': {
    en: 'An AI-assisted vector editor built with Fabric.js, React, and Tailwind. AI features powered by Anthropic. Source managed with Git.',
    zh: '一款基于 Fabric.js、React 和 Tailwind 构建的 AI 辅助矢量编辑器。AI 功能由 Anthropic 提供。源码使用 Git 管理。',
  },
  'Credits: Fabric.js, React, Anthropic, Lucide icons.': {
    en: 'Credits: Fabric.js, React, Anthropic, Lucide icons.',
    zh: '致谢：Fabric.js、React、Anthropic、Lucide 图标。',
  },
  'Close': { en: 'Close', zh: '关闭' },
  'Dismiss': { en: 'Dismiss', zh: '关闭' },
  'Toggle': { en: 'Toggle', zh: '切换' },

  // -------- Toolbar (tools) --------
  'Select': { en: 'Select', zh: '选择' },
  'Rectangle': { en: 'Rectangle', zh: '矩形' },
  'Ellipse': { en: 'Ellipse', zh: '椭圆' },
  'Line': { en: 'Line', zh: '直线' },
  'Polygon': { en: 'Polygon', zh: '多边形' },
  'Rect': { en: 'Rect', zh: '矩形' },
  'Circle': { en: 'Circle', zh: '圆形' },
  'Polyline': { en: 'Polyline', zh: '折线' },
  'Path': { en: 'Path', zh: '路径' },
  'Image': { en: 'Image', zh: '图像' },
  'image': { en: 'image', zh: '图像' },
  'Selection': { en: 'Selection', zh: '选区' },
  'Object': { en: 'Object', zh: '对象' },
  'Pen': { en: 'Pen', zh: '钢笔' },
  'Pencil': { en: 'Pencil', zh: '铅笔' },
  'Text': { en: 'Text', zh: '文本' },
  'Hand': { en: 'Hand', zh: '抓手' },
  'Zoom': { en: 'Zoom', zh: '缩放' },

  // -------- Properties panel: section headers --------
  'Appearance': { en: 'Appearance', zh: '外观' },
  'Gradient': { en: 'Gradient', zh: '渐变' },
  'Drop shadow': { en: 'Drop shadow', zh: '投影' },
  'Advanced stroke': { en: 'Advanced stroke', zh: '高级描边' },
  'Blend mode': { en: 'Blend mode', zh: '混合模式' },
  'Transform': { en: 'Transform', zh: '变换' },
  'Arrange': { en: 'Arrange', zh: '排列' },
  'Font': { en: 'Font', zh: '字体' },

  // -------- Properties panel: field labels --------
  'Fill': { en: 'Fill', zh: '填充' },
  'Stroke': { en: 'Stroke', zh: '描边' },
  'Stroke W': { en: 'Stroke W', zh: '描边宽度' },
  'Opacity': { en: 'Opacity', zh: '不透明度' },
  'Color': { en: 'Color', zh: '颜色' },
  'Stop': { en: 'Stop', zh: '色标' },
  'color': { en: 'color', zh: '颜色' },
  'offset': { en: 'offset', zh: '偏移' },
  'color value': { en: 'color value', zh: '颜色值' },
  'swatch': { en: 'swatch', zh: '色块' },
  'best': { en: 'best', zh: '最佳' },
  'balanced': { en: 'balanced', zh: '平衡' },
  'fast': { en: 'fast', zh: '快速' },
  'Blur': { en: 'Blur', zh: '模糊' },
  'Filters': { en: 'Filters', zh: '滤镜' },
  'Custom': { en: 'Custom', zh: '自定义' },
  'Clear all filters': { en: 'Clear all filters', zh: '清除所有滤镜' },
  'None': { en: 'None', zh: '无' },
  'Sepia': { en: 'Sepia', zh: '褐色' },
  'Grayscale': { en: 'Grayscale', zh: '灰度' },
  'Gray': { en: 'Gray', zh: '灰度' },
  'Hue': { en: 'Hue', zh: '色相' },
  'Saturation': { en: 'Saturation', zh: '饱和度' },
  'Lightness': { en: 'Lightness', zh: '亮度' },
  'Gaussian blur': { en: 'Gaussian blur', zh: '高斯模糊' },
  'Brightness +': { en: 'Brightness +', zh: '亮度 +' },
  'Brightness -': { en: 'Brightness -', zh: '亮度 -' },
  'Contrast +': { en: 'Contrast +', zh: '对比度 +' },
  'Contrast -': { en: 'Contrast -', zh: '对比度 -' },
  'Hue rotate': { en: 'Hue rotate', zh: '色相旋转' },
  'Offset X': { en: 'Offset X', zh: 'X 偏移' },
  'Offset Y': { en: 'Offset Y', zh: 'Y 偏移' },
  'Angle': { en: 'Angle', zh: '角度' },
  'Dash': { en: 'Dash', zh: '虚线' },
  'Line cap': { en: 'Line cap', zh: '端点' },
  'Line join': { en: 'Line join', zh: '拐角' },
  'Mode': { en: 'Mode', zh: '模式' },
  'Stops': { en: 'Stops', zh: '色标' },
  'Linear': { en: 'Linear', zh: '线性' },
  'Radial': { en: 'Radial', zh: '径向' },
  'Mirror': { en: 'Mirror', zh: '镜像' },
  'copies': { en: 'copies', zh: '个副本' },
  'Solid': { en: 'Solid', zh: '实线' },
  'Dashed': { en: 'Dashed', zh: '虚线' },
  'Dotted': { en: 'Dotted', zh: '点线' },
  'Butt': { en: 'Butt', zh: '平头' },
  'Round': { en: 'Round', zh: '圆头' },
  'Square': { en: 'Square', zh: '方头' },
  'Miter': { en: 'Miter', zh: '尖角' },
  'Bevel': { en: 'Bevel', zh: '斜角' },
  'Stroke alignment': { en: 'Stroke alignment', zh: '描边对齐' },
  'Center': { en: 'Center', zh: '居中' },
  'Inside': { en: 'Inside', zh: '内侧' },
  'Outside': { en: 'Outside', zh: '外侧' },

  // -------- Properties panel: actions --------
  'Pick color': { en: 'Pick color', zh: '取色器' },
  'Suggest palette': { en: 'Suggest palette', zh: '推荐配色' },
  'Apply gradient': { en: 'Apply gradient', zh: '应用渐变' },
  'Add': { en: 'Add', zh: '添加' },
  'Add stop': { en: 'Add stop', zh: '添加色标' },
  'Remove stop': { en: 'Remove stop', zh: '删除色标' },
  'Swatches': { en: 'Swatches', zh: '色板' },
  'Alt = stroke · right-click = remove': { en: 'Alt = stroke · right-click = remove', zh: 'Alt = 描边 · 右键 = 删除' },
  'Add current fill': { en: 'Add current fill', zh: '添加当前填充色' },
  'Advanced color picker': { en: 'Advanced color picker', zh: '高级取色器' },
  'Adv': { en: 'Adv', zh: '高级' },
  'Pick color with eyedropper': { en: 'Pick color with eyedropper', zh: '使用吸管取色' },
  'EyeDropper API not available in this browser.': { en: 'EyeDropper API not available in this browser.', zh: '当前浏览器不支持取色器 API。' },
  'Generate a 5-color palette from current fill': { en: 'Generate a 5-color palette from current fill', zh: '基于当前填充色生成 5 色配色' },

  // -------- Transform fields --------
  'X': { en: 'X', zh: 'X' },
  'Y': { en: 'Y', zh: 'Y' },
  'W': { en: 'W', zh: '宽' },
  'H': { en: 'H', zh: '高' },
  'Rot': { en: 'Rot', zh: '旋转' },

  // -------- Arrange tooltips --------
  'Bring to Front': { en: 'Bring to Front', zh: '置于顶层' },
  'Bring Forward': { en: 'Bring Forward', zh: '上移一层' },
  'Send Backward': { en: 'Send Backward', zh: '下移一层' },
  'Send to Back': { en: 'Send to Back', zh: '置于底层' },
  'Group': { en: 'Group', zh: '编组' },
  'Ungroup': { en: 'Ungroup', zh: '取消编组' },
  'Duplicate': { en: 'Duplicate', zh: '复制' },
  'Delete': { en: 'Delete', zh: '删除' },
  'Cut': { en: 'Cut', zh: '剪切' },
  'Copy': { en: 'Copy', zh: '拷贝' },
  'Paste': { en: 'Paste', zh: '粘贴' },
  'Bold': { en: 'Bold', zh: '加粗' },
  'Italic': { en: 'Italic', zh: '斜体' },
  'Underline': { en: 'Underline', zh: '下划线' },
  'Strikethrough': { en: 'Strikethrough', zh: '删除线' },
  'Tracking': { en: 'Tracking', zh: '字距' },
  'Leading': { en: 'Leading', zh: '行距' },
  'UPPERCASE': { en: 'UPPERCASE', zh: '大写' },
  'lowercase': { en: 'lowercase', zh: '小写' },
  'Title Case': { en: 'Title Case', zh: '首字母大写' },

  // -------- Selection footer --------
  'object selected': { en: 'object selected', zh: '个对象已选中' },
  'objects selected': { en: 'objects selected', zh: '个对象已选中' },

  // -------- Align panel --------
  'Align & Distribute': { en: 'Align & Distribute', zh: '对齐与分布' },
  'Align': { en: 'Align', zh: '对齐' },
  'Distribute': { en: 'Distribute', zh: '分布' },
  'Pathfinder': { en: 'Pathfinder', zh: '路径查找器' },
  'Align left': { en: 'Align left', zh: '左对齐' },
  'Align center': { en: 'Align center', zh: '居中对齐' },
  'Align center horizontally': { en: 'Align center horizontally', zh: '水平居中对齐' },
  'Align right': { en: 'Align right', zh: '右对齐' },
  'Justify': { en: 'Justify', zh: '两端对齐' },
  'Align top': { en: 'Align top', zh: '顶对齐' },
  'Align center vertically': { en: 'Align center vertically', zh: '垂直居中对齐' },
  'Align bottom': { en: 'Align bottom', zh: '底对齐' },
  'Distribute horizontally (equal spacing)': { en: 'Distribute horizontally (equal spacing)', zh: '水平分布（等间距）' },
  'Distribute vertically (equal spacing)': { en: 'Distribute vertically (equal spacing)', zh: '垂直分布（等间距）' },
  'Union': { en: 'Union', zh: '并集' },
  'Subtract': { en: 'Subtract', zh: '减去' },
  'Intersect': { en: 'Intersect', zh: '相交' },
  'Exclude': { en: 'Exclude', zh: '排除' },
  'Union of selected shapes': { en: 'Union of selected shapes', zh: '所选形状的并集' },
  'Subtract top shape from bottom': { en: 'Subtract top shape from bottom', zh: '从底部减去顶部形状' },
  'Intersection of shapes': { en: 'Intersection of shapes', zh: '形状的交集' },
  'Exclude overlapping area': { en: 'Exclude overlapping area', zh: '排除重叠区域' },

  // -------- Layers panel --------
  'Layers': { en: 'Layers', zh: '图层' },
  'No objects yet — draw something with the toolbar.': {
    en: 'No objects yet — draw something with the toolbar.',
    zh: '暂无对象——使用左侧工具栏开始绘制。',
  },

  // -------- Assets panel --------
  'Assets': { en: 'Assets', zh: '素材' },
  'Import': { en: 'Import', zh: '导入' },
  'Trace': { en: 'Trace', zh: '描摹' },
  'Tracing…': { en: 'Tracing…', zh: '描摹中…' },
  'Image traced': { en: 'Image traced', zh: '图像已描摹' },
  'Import an image into the library': { en: 'Import an image into the library', zh: '将图像导入到库中' },
  'Trace the selected raster image into a polygon': { en: 'Trace the selected raster image into a polygon', zh: '将选中位图描摹为多边形' },
  "Drop images on the canvas or use Import — they'll show up here for quick re-use.": {
    en: "Drop images on the canvas or use Import — they'll show up here for quick re-use.",
    zh: '将图像拖到画布或使用「导入」——它们会出现在此处便于复用。',
  },
  'Remove from library': { en: 'Remove from library', zh: '从库中移除' },
  'click to insert': { en: 'click to insert', zh: '点击插入' },

  // -------- AI panel --------
  'AI Assistant': { en: 'AI Assistant', zh: 'AI 助手' },
  'MCP / Skills': { en: 'MCP / Skills', zh: 'MCP / 技能' },
  'Settings': { en: 'Settings', zh: '设置' },
  'Vision': { en: 'Vision', zh: '视觉' },
  'SVG': { en: 'SVG', zh: 'SVG' },
  'SVG import failed': { en: 'SVG import failed', zh: 'SVG 导入失败' },
  'SVG imported with warnings': { en: 'SVG imported with warnings', zh: 'SVG 已导入（有警告）' },
  'Stream': { en: 'Stream', zh: '流式' },
  'skill': { en: 'skill', zh: '项技能' },
  'skills': { en: 'skills', zh: '项技能' },
  'thinking…': { en: 'thinking…', zh: '思考中…' },
  'Describe an edit or design…': { en: 'Describe an edit or design…', zh: '描述要进行的编辑或设计…' },
  'Ask Claude to design, refine, or critique your artwork.': {
    en: 'Ask Claude to design, refine, or critique your artwork.',
    zh: '让 Claude 设计、优化或评价你的作品。',
  },
  '"Draw a minimalist mountain logo in two colors"': {
    en: '"Draw a minimalist mountain logo in two colors"',
    zh: '“用两种颜色绘制一个极简风格的山形 Logo”',
  },
  '"Make my shapes align in a row, equal spacing"': {
    en: '"Make my shapes align in a row, equal spacing"',
    zh: '“将我的形状排成一行，间距相等”',
  },
  '"Suggest a better color palette and apply it"': {
    en: '"Suggest a better color palette and apply it"',
    zh: '“推荐一个更好的配色并应用”',
  },
  'Model': { en: 'Model', zh: '模型' },
  'unset': { en: 'unset', zh: '未设置' },
  'Streaming': { en: 'Streaming', zh: '流式' },
  'on': { en: 'on', zh: '开' },
  'off': { en: 'off', zh: '关' },
  '✨ Critique design': { en: '✨ Critique design', zh: '✨ 评价设计' },
  '🎨 Better palette': { en: '🎨 Better palette', zh: '🎨 更好的配色' },
  '📐 Tidy alignment': { en: '📐 Tidy alignment', zh: '📐 整理对齐' },
  '🧩 Convert to icon set': { en: '🧩 Convert to icon set', zh: '🧩 转换为图标集' },
  'AI Configuration': { en: 'AI Configuration', zh: 'AI 配置' },
  'Anthropic API Key': { en: 'Anthropic API Key', zh: 'Anthropic API 密钥' },
  'Base URL': { en: 'Base URL', zh: 'Base URL' },
  'Enable vision (send canvas snapshot to model)': {
    en: 'Enable vision (send canvas snapshot to model)',
    zh: '启用视觉（向模型发送画布快照）',
  },
  'Stream responses (token-by-token output)': {
    en: 'Stream responses (token-by-token output)',
    zh: '流式返回（逐 token 输出）',
  },
  'Save': { en: 'Save', zh: '保存' },
  'Save now': { en: 'Save now', zh: '立即保存' },
  'Cancel': { en: 'Cancel', zh: '取消' },
  'MCP Servers & Skills': { en: 'MCP Servers & Skills', zh: 'MCP 服务器与技能' },
  'Local Skills (tools available to the model)': {
    en: 'Local Skills (tools available to the model)',
    zh: '本地技能（模型可调用的工具）',
  },
  'No skills registered. Use': { en: 'No skills registered. Use', zh: '未注册任何技能。请使用' },
  'MCP Servers': { en: 'MCP Servers', zh: 'MCP 服务器' },
  'Server name': { en: 'Server name', zh: '服务器名称' },
  'Server URL': { en: 'Server URL', zh: '服务器 URL' },
  'Transport': { en: 'Transport', zh: '传输协议' },
  'Remove server': { en: 'Remove server', zh: '删除服务器' },
  '+ Add': { en: '+ Add', zh: '+ 添加' },
  'Test': { en: 'Test', zh: '测试' },
  'Testing…': { en: 'Testing…', zh: '测试中…' },

  // -------- Cut Contour dialog (vinyl-cutter print-and-cut suite) --------
  'Cut Contour': { en: 'Cut Contour', zh: '刻字轮廓' },
  'Cut Contour…': { en: 'Cut Contour…', zh: '刻字轮廓…' },
  'Outline': { en: 'Outline', zh: '轮廓' },
  'Trace Bitmap': { en: 'Trace Bitmap', zh: '位图巡边' },
  'Reg Marks': { en: 'Reg Marks', zh: '对位标记' },
  // 'Preview' translation already exists below in the contrast-checker
  // section — reused verbatim by both dialogs.
  'Hide preview': { en: 'Hide preview', zh: '隐藏预览' },
  'Show preview': { en: 'Show preview', zh: '显示预览' },
  'Offset': { en: 'Offset', zh: '偏移' },
  'Passes': { en: 'Passes', zh: '切割次数' },
  'Generate Contour from Selection': { en: 'Generate Contour from Selection', zh: '为选中对象生成轮廓' },
  'Generate a parallel-offset cut line around the selected shapes. Positive values offset outward, negative shrink inward.': {
    en: 'Generate a parallel-offset cut line around the selected shapes. Positive values offset outward, negative shrink inward.',
    zh: '在选中的图形周围生成等距偏移刻字轮廓。正值向外扩张，负值向内收缩。',
  },
  'Threshold': { en: 'Threshold', zh: '阈值' },
  'Simplify': { en: 'Simplify', zh: '简化' },
  'Use alpha channel (best for transparent PNGs)': {
    en: 'Use alpha channel (best for transparent PNGs)',
    zh: '使用 Alpha 通道（适合透明 PNG）',
  },
  'Trace Selected Image': { en: 'Trace Selected Image', zh: '描摹选中图像' },
  'Convert a placed bitmap (PNG/JPG) into vector cut paths by tracing the edges of dark or opaque regions.': {
    en: 'Convert a placed bitmap (PNG/JPG) into vector cut paths by tracing the edges of dark or opaque regions.',
    zh: '将画布上的位图（PNG/JPG）通过描摹深色或不透明区域的边界转为矢量刻字路径。',
  },
  'Arm length': { en: 'Arm length', zh: '臂长' },
  'Inset X': { en: 'Inset X', zh: 'X 偏移' },
  'Inset Y': { en: 'Inset Y', zh: 'Y 偏移' },
  'Inset from corner': { en: 'Inset from corner', zh: '距边距' },
  'Fit to current selection (otherwise: first artboard / all cut paths)': {
    en: 'Fit to current selection (otherwise: first artboard / all cut paths)',
    zh: '贴合当前选中（否则使用首画板 / 所有刻字路径的范围）',
  },
  'Place Registration Marks': { en: 'Place Registration Marks', zh: '放置对位标记' },
  'Add 4-corner L-shape registration marks (Roland CutStudio convention) so the cutter\'s optical sensor can align with your printed art.': {
    en: 'Add 4-corner L-shape registration marks (Roland CutStudio convention) so the cutter\'s optical sensor can align with your printed art.',
    zh: '添加 4 角 L 形对位标记（罗兰 CutStudio 标准），让刻字机的光学传感器可以校准你打印的图像。',
  },
  'Current': { en: 'Current', zh: '当前' },
  'outline': { en: 'outline', zh: '轮廓' },
  'trace': { en: 'trace', zh: '巡边' },
  'regmark': { en: 'regmark', zh: '对位' },
  'Clear all': { en: 'Clear all', zh: '清空全部' },
  'Clear all cut paths': { en: 'Clear all cut paths', zh: '清除所有刻字路径' },
  'Generate cut paths first': { en: 'Generate cut paths first', zh: '请先生成刻字路径' },
  'Nothing to contour': { en: 'Nothing to contour', zh: '没有可生成轮廓的对象' },
  'Select one or more shapes first.': { en: 'Select one or more shapes first.', zh: '请先选中一个或多个图形。' },
  'No geometry was produced — try a smaller offset distance.': {
    en: 'No geometry was produced — try a smaller offset distance.',
    zh: '未能生成几何 — 试试更小的偏移距离。',
  },
  'Empty contour': { en: 'Empty contour', zh: '空轮廓' },
  'contour(s) added': { en: 'contour(s) added', zh: '条轮廓已添加' },
  'Contour generated': { en: 'Contour generated', zh: '已生成轮廓' },
  'Nothing to trace': { en: 'Nothing to trace', zh: '无可描摹对象' },
  'Select a placed image first.': { en: 'Select a placed image first.', zh: '请先选中一张位图。' },
  'Trace failed': { en: 'Trace failed', zh: '描摹失败' },
  'Image source unavailable.': { en: 'Image source unavailable.', zh: '位图源不可用。' },
  'No traceable regions found. Try lowering the threshold or toggling alpha.': {
    en: 'No traceable regions found. Try lowering the threshold or toggling alpha.',
    zh: '未找到可描摹区域。请降低阈值或切换 Alpha 模式。',
  },
  'Trace empty': { en: 'Trace empty', zh: '描摹结果为空' },
  'contour(s) traced': { en: 'contour(s) traced', zh: '条轮廓已描摹' },
  'Bitmap traced': { en: 'Bitmap traced', zh: '位图描摹完成' },
  '4-corner registration marks added.': { en: '4-corner registration marks added.', zh: '已添加 4 角对位标记。' },
  'Reg marks': { en: 'Reg marks', zh: '对位标记' },
  '4 reg marks detected': { en: '4 reg marks detected', zh: '已识别到 4 个对位标记' },
  'Output will use cut paths instead of canvas SVG.': {
    en: 'Output will use cut paths instead of canvas SVG.',
    zh: '输出将使用刻字路径而非画布 SVG。',
  },
  'cut paths': { en: 'cut paths', zh: '刻字路径' },

  // -------- Updater UX (toast + progress bar) --------
  'Updates': { en: 'Updates', zh: '更新' },
  'Updates apply automatically in the PWA build.': {
    en: 'Updates apply automatically in the PWA build.',
    zh: 'PWA 版本会自动应用更新。',
  },
  'Update check failed': { en: 'Update check failed', zh: '检查更新失败' },
  'No update available': { en: 'No update available', zh: '已是最新版本' },
  'You are on the latest version.': { en: 'You are on the latest version.', zh: '已经是最新版本。' },
  'Update available': { en: 'Update available', zh: '有新版本可用' },
  'A new version': { en: 'A new version', zh: '新版本' },
  'Install': { en: 'Install', zh: '安装' },
  'Updating to': { en: 'Updating to', zh: '正在更新到' },
  'Preparing download…': { en: 'Preparing download…', zh: '准备下载…' },
  'Downloading': { en: 'Downloading', zh: '下载中' },
  'Downloading…': { en: 'Downloading…', zh: '下载中…' },
  'Verifying signature…': { en: 'Verifying signature…', zh: '校验签名…' },
  'Update installed': { en: 'Update installed', zh: '更新已安装' },
  'Restart to load v': { en: 'Restart to load v', zh: '重启以加载 v' },
  'Restart now': { en: 'Restart now', zh: '立即重启' },
  'Update failed': { en: 'Update failed', zh: '更新失败' },
  'Restart failed': { en: 'Restart failed', zh: '重启失败' },
  'Check for Updates…': { en: 'Check for Updates…', zh: '检查更新…' },

  // -------- Plotter dialog --------
  'Send to Plotter / Cutter': { en: 'Send to Plotter / Cutter', zh: '发送到绘图仪 / 切割机' },
  'Format': { en: 'Format', zh: '格式' },
  'G-code (CNC / pen plotter)': { en: 'G-code (CNC / pen plotter)', zh: 'G 代码（CNC / 笔式绘图仪）' },
  'HP-GL (vinyl cutter)': { en: 'HP-GL (vinyl cutter)', zh: 'HP-GL（刻字机）' },
  'HP-GL / PLT (vinyl cutter)': { en: 'HP-GL / PLT (vinyl cutter)', zh: 'HP-GL / PLT（刻字机）' },
  'Cutter dialect': { en: 'Cutter dialect', zh: '刻字机方言' },
  'Picks the wrapper commands. Bare = generic; Roland adds TB/CT/!PG; Graphtec adds FS/VS.': {
    en: 'Picks the wrapper commands. Bare = generic; Roland adds TB/CT/!PG; Graphtec adds FS/VS.',
    zh: '选择封装命令。Bare = 通用；Roland 添加 TB/CT/!PG；Graphtec 添加 FS/VS。',
  },
  'Bare HP-GL (generic)': { en: 'Bare HP-GL (generic)', zh: 'Bare HP-GL（通用）' },
  'Roland CAMM (TB / CT / !PG)': { en: 'Roland CAMM (TB / CT / !PG)', zh: '罗兰 CAMM（TB / CT / !PG）' },
  'Graphtec FC (FS / VS)': { en: 'Graphtec FC (FS / VS)', zh: 'Graphtec FC（FS / VS）' },
  'HP-GL vinyl-cutter format — exports with the dialect from the Plotter dialog; imports Roland / Graphtec / bare HP-GL.': {
    en: 'HP-GL vinyl-cutter format — exports with the dialect from the Plotter dialog; imports Roland / Graphtec / bare HP-GL.',
    zh: 'HP-GL 刻字机格式 — 按绘图仪对话框中的方言导出；可导入罗兰 / Graphtec / 裸 HP-GL。',
  },
  'PLT file had no cuttable geometry.': {
    en: 'PLT file had no cuttable geometry.', zh: 'PLT 文件中没有可刻字的几何。',
  },
  'Nothing imported': { en: 'Nothing imported', zh: '未导入任何内容' },
  'Imported PLT': { en: 'Imported PLT', zh: 'PLT 已导入' },
  'PLT import failed': { en: 'PLT import failed', zh: 'PLT 导入失败' },
  'bare HP-GL': { en: 'bare HP-GL', zh: '裸 HP-GL' },
  'Unit': { en: 'Unit', zh: '单位' },
  'mm': { en: 'mm', zh: '毫米' },
  'inches': { en: 'inches', zh: '英寸' },
  'Feed rate': { en: 'Feed rate', zh: '进给速度' },
  'Travel rate': { en: 'Travel rate', zh: '空程速度' },
  'Pen down Z': { en: 'Pen down Z', zh: '落笔 Z' },
  'Pen up Z': { en: 'Pen up Z', zh: '抬笔 Z' },
  'Paper height': { en: 'Paper height', zh: '纸张高度' },
  'Curve tolerance (px)': { en: 'Curve tolerance (px)', zh: '曲线精度 (px)' },
  'Origin at bottom-left (CNC convention)': {
    en: 'Origin at bottom-left (CNC convention)',
    zh: '原点位于左下角（CNC 约定）',
  },
  'Generate Preview': { en: 'Generate Preview', zh: '生成预览' },
  'Save File': { en: 'Save File', zh: '保存文件' },
  'Send via USB': { en: 'Send via USB', zh: '通过 USB 发送' },
  'Sending…': { en: 'Sending…', zh: '发送中…' },
  '✅ Sent to plotter': { en: '✅ Sent to plotter', zh: '✅ 已发送到绘图仪' },
  '(click Generate Preview)': { en: '(click Generate Preview)', zh: '（点击「生成预览」）' },
  'USB serial works in Chrome/Edge over HTTPS or localhost via the Web Serial API.': {
    en: 'USB serial works in Chrome/Edge over HTTPS or localhost via the Web Serial API.',
    zh: 'USB 串口需要在 Chrome/Edge 浏览器中通过 HTTPS 或 localhost 使用 Web Serial API。',
  },

  // -------- Print dialog --------
  'Page size': { en: 'Page size', zh: '页面尺寸' },
  'Orientation': { en: 'Orientation', zh: '方向' },
  'Portrait': { en: 'Portrait', zh: '纵向' },
  'Landscape': { en: 'Landscape', zh: '横向' },
  'Scaling': { en: 'Scaling', zh: '缩放' },
  'Actual size': { en: 'Actual size', zh: '实际大小' },
  'Fit to page': { en: 'Fit to page', zh: '适合页面' },
  'Fill page': { en: 'Fill page', zh: '填充页面' },
  'Margin (mm)': { en: 'Margin (mm)', zh: '边距 (mm)' },

  // -------- Document settings --------
  'Document Settings': { en: 'Document Settings', zh: '文档设置' },
  'Width (px)': { en: 'Width (px)', zh: '宽度 (px)' },
  'Height (px)': { en: 'Height (px)', zh: '高度 (px)' },
  'DPI': { en: 'DPI', zh: 'DPI' },
  'Background': { en: 'Background', zh: '背景' },
  'Apply': { en: 'Apply', zh: '应用' },

  // -------- Status bar --------
  'GRID': { en: 'GRID', zh: '网格' },
  'SNAP': { en: 'SNAP', zh: '吸附' },
  'GUIDES': { en: 'GUIDES', zh: '参考线' },
  'Objects': { en: 'Objects', zh: '对象' },
  'Selected': { en: 'Selected', zh: '已选' },

  // -------- Onboarding --------
  'Getting Started': { en: 'Getting Started', zh: '开始使用' },
  'Welcome to Anchorworks': { en: 'Welcome to Anchorworks', zh: '欢迎使用 Anchorworks' },
  'An AI-assisted vector editor built for designers and makers.': {
    en: 'An AI-assisted vector editor built for designers and makers.',
    zh: '一款为设计师与创客打造的 AI 辅助矢量编辑器。',
  },
  'Powerful Fabric.js canvas with layers, smart guides, snap': {
    en: 'Powerful Fabric.js canvas with layers, smart guides, snap',
    zh: '强大的 Fabric.js 画布，支持图层、智能参考线与吸附',
  },
  'SVG, PDF, DXF, PNG, JPG import & export': {
    en: 'SVG, PDF, DXF, PNG, JPG import & export',
    zh: 'SVG、PDF、DXF、PNG、JPG 的导入与导出',
  },
  'Boolean path operations and path editing': {
    en: 'Boolean path operations and path editing',
    zh: '布尔路径运算与路径编辑',
  },
  'Direct plotter (G-code / HPGL) output': {
    en: 'Direct plotter (G-code / HPGL) output',
    zh: '直接输出绘图仪指令（G 代码 / HPGL）',
  },
  'Tools at a Glance': { en: 'Tools at a Glance', zh: '工具一览' },
  'Click the orange': { en: 'Click the orange', zh: '点击右上角的橙色' },
  'button (top-right).': { en: 'button (top-right).', zh: '按钮。' },
  'The assistant can see your canvas, suggest layouts, build shapes, align, distribute, and run boolean ops — all by chatting.': {
    en: 'The assistant can see your canvas, suggest layouts, build shapes, align, distribute, and run boolean ops — all by chatting.',
    zh: '助手可以查看你的画布，建议布局、构建形状、对齐、分布以及执行布尔运算——一切都通过对话完成。',
  },
  'Bring your own Anthropic API key in the panel to get started.': {
    en: 'Bring your own Anthropic API key in the panel to get started.',
    zh: '在面板中填入你自己的 Anthropic API 密钥即可开始使用。',
  },
  'Plotter & Print': { en: 'Plotter & Print', zh: '绘图与打印' },
  'Export from the': { en: 'Export from the', zh: '通过' },
  'menu (SVG, PNG, PDF, DXF, JSON).': { en: 'menu (SVG, PNG, PDF, DXF, JSON).', zh: '菜单导出（SVG、PNG、PDF、DXF、JSON）。' },
  'Send to Plotter': { en: 'Send to Plotter', zh: '发送到绘图仪' },
  'writes G-code or HPGL for pen plotters, laser engravers, and CNC.': {
    en: 'writes G-code or HPGL for pen plotters, laser engravers, and CNC.',
    zh: '可为笔式绘图仪、激光雕刻机和 CNC 生成 G 代码或 HPGL。',
  },
  'opens the system print dialog with tiled support.': {
    en: 'opens the system print dialog with tiled support.',
    zh: '打开系统打印对话框，支持分页打印。',
  },
  'Back': { en: 'Back', zh: '上一步' },
  'Next': { en: 'Next', zh: '下一步' },
  'Get Started': { en: 'Get Started', zh: '开始使用' },

  // -------- Shortcuts dialog --------
  'Tools': { en: 'Tools', zh: '工具' },
  'Probe failed': { en: 'Probe failed', zh: '探测失败' },
  'Refresh': { en: 'Refresh', zh: '刷新' },
  'Refreshing…': { en: 'Refreshing…', zh: '刷新中…' },
  'Refresh tools': { en: 'Refresh tools', zh: '刷新工具列表' },
  'Remote MCP Tools (discovered)': { en: 'Remote MCP Tools (discovered)', zh: '远程 MCP 工具（已发现）' },
  'MCP discovery complete': { en: 'MCP discovery complete', zh: 'MCP 发现完成' },
  'No tools discovered': { en: 'No tools discovered', zh: '未发现任何工具' },
  'Focus this artboard': { en: 'Focus this artboard', zh: '聚焦此画板' },
  'Artboard navigation': { en: 'Artboard navigation', zh: '画板导航' },
  'Previous artboard': { en: 'Previous artboard', zh: '上一个画板' },
  'Next artboard': { en: 'Next artboard', zh: '下一个画板' },
  'of': { en: 'of', zh: '共' },
  'Tool failed': { en: 'Tool failed', zh: '工具调用失败' },
  'Send message': { en: 'Send message', zh: '发送消息' },
  'Computing boolean…': { en: 'Computing boolean…', zh: '正在计算布尔运算…' },
  'Tracing image…': { en: 'Tracing image…', zh: '正在描摹图像…' },
  'Clear log': { en: 'Clear log', zh: '清空日志' },
  '(none)': { en: '(none)', zh: '（无）' },
  'none': { en: 'none', zh: '无' },
  'tight': { en: 'tight', zh: '紧凑' },
  'normal': { en: 'normal', zh: '正常' },
  'loose': { en: 'loose', zh: '宽松' },
  'wide': { en: 'wide', zh: '极宽' },
  'Actions': { en: 'Actions', zh: '操作' },
  'Duplicate selection': { en: 'Duplicate selection', zh: '复制所选' },
  'Delete selection': { en: 'Delete selection', zh: '删除所选' },
  'Nudge selection (1 px)': { en: 'Nudge selection (1 px)', zh: '微调所选 (1 px)' },
  'Temporary Hand (pan)': { en: 'Temporary Hand (pan)', zh: '临时抓手 (平移)' },
  'Nudge selection (10 px)': { en: 'Nudge selection (10 px)', zh: '微调所选 (10 px)' },
  'Zoom in': { en: 'Zoom in', zh: '放大' },
  'Zoom out': { en: 'Zoom out', zh: '缩小' },
  'Zoom fit': { en: 'Zoom fit', zh: '适合窗口' },
  'Show this dialog': { en: 'Show this dialog', zh: '显示此对话框' },
  'anytime to open this dialog.': { en: 'anytime to open this dialog.', zh: '随时打开本对话框。' },
  'Press': { en: 'Press', zh: '按下' },

  // -------- Templates dialog --------
  'New from Template': { en: 'New from Template', zh: '从模板新建' },

  // -------- Font picker --------
  'Upload': { en: 'Upload', zh: '上传' },
  'Upload a custom font (TTF / OTF / WOFF)': {
    en: 'Upload a custom font (TTF / OTF / WOFF)',
    zh: '上传自定义字体（TTF / OTF / WOFF）',
  },
  'Search fonts…': { en: 'Search fonts…', zh: '搜索字体…' },

  // -------- Recovery dialog --------
  'Recover unsaved work?': { en: 'Recover unsaved work?', zh: '恢复未保存的工作？' },
  'We found an auto-saved copy of your previous session from': {
    en: 'We found an auto-saved copy of your previous session from',
    zh: '我们找到了来自以下时间的自动保存副本：',
  },
  'Would you like to restore it?': { en: 'Would you like to restore it?', zh: '是否要恢复？' },
  'Discard': { en: 'Discard', zh: '丢弃' },
  'Restore': { en: 'Restore', zh: '恢复' },

  // -------- Debug panel --------
  'log': { en: 'log', zh: '日志' },
  'state': { en: 'state', zh: '状态' },
  'perf': { en: 'perf', zh: '性能' },
  'No log entries.': { en: 'No log entries.', zh: '暂无日志条目。' },
  'FPS target: 60 (canvas re-renders on demand)': {
    en: 'FPS target: 60 (canvas re-renders on demand)',
    zh: 'FPS 目标：60（画布按需重绘）',
  },
  'Object count': { en: 'Object count', zh: '对象数' },
  'JS heap': { en: 'JS heap', zh: 'JS 堆' },
  'UserAgent': { en: 'UserAgent', zh: 'UserAgent' },
  'Web Serial': { en: 'Web Serial', zh: 'Web 串口' },
  '✅ available': { en: '✅ available', zh: '✅ 可用' },
  '❌ not available': { en: '❌ not available', zh: '❌ 不可用' },

  // -------- Color picker popover --------
  'HEX': { en: 'HEX', zh: 'HEX' },
  'Recent': { en: 'Recent', zh: '最近' },
  'No recent colors yet.': { en: 'No recent colors yet.', zh: '暂无最近使用的颜色。' },

  // -------- Loading --------
  'Loading AI…': { en: 'Loading AI…', zh: 'AI 加载中…' },
  'Loading Help Center…': { en: 'Loading Help Center…', zh: '帮助中心加载中…' },

  // -------- Empty canvas hint --------
  'Blank canvas': { en: 'Blank canvas', zh: '空白画布' },
  'Pick a tool from the left, drop an SVG, or pick a template from File menu.':
    { en: 'Pick a tool from the left, drop an SVG, or pick a template from File menu.',
      zh: '从左侧选择工具，或拖入 SVG，或在「文件」菜单选择模板。' },
  'Press ⌘K for command palette': { en: 'Press ⌘K for command palette', zh: '按 ⌘K 打开命令面板' },
  'Press Ctrl+K for command palette': { en: 'Press Ctrl+K for command palette', zh: '按 Ctrl+K 打开命令面板' },
  'Offline': { en: 'Offline', zh: '离线' },
  'Canvas workspace': { en: 'Canvas workspace', zh: '画布工作区' },
  'Skip to canvas': { en: 'Skip to canvas', zh: '跳至画布' },
  'Panels': { en: 'Panels', zh: '面板' },
  'Anchorworks canvas — arrow keys nudge selection, Delete removes, Ctrl+Z undoes': {
    en: 'Anchorworks canvas — arrow keys nudge selection, Delete removes, Ctrl+Z undoes',
    zh: 'Anchorworks 画布 — 方向键微移选区、Delete 删除、Ctrl+Z 撤销',
  },
  'Application chrome': { en: 'Application chrome', zh: '应用顶栏' },
  'Application menu': { en: 'Application menu', zh: '应用菜单' },
  'High contrast enabled': { en: 'High contrast enabled', zh: '已开启高对比度' },
  'High contrast disabled': { en: 'High contrast disabled', zh: '已关闭高对比度' },
  'Light theme enabled': { en: 'Light theme enabled', zh: '已切换到浅色主题' },
  'Dark theme enabled': { en: 'Dark theme enabled', zh: '已切换到深色主题' },
  'Outline View on': { en: 'Outline View on', zh: '已开启轮廓视图' },
  'Outline View off': { en: 'Outline View off', zh: '已关闭轮廓视图' },
  'Clear recent files': { en: 'Clear recent files', zh: '清除最近文件' },
  'Clear Recent': { en: 'Clear Recent', zh: '清除最近' },
  'Recent Files': { en: 'Recent Files', zh: '最近文件' },
  'Open recent': { en: 'Open recent', zh: '打开最近文件' },
  'Properties and panels': { en: 'Properties and panels', zh: '属性与面板' },
  'Slide': { en: 'Slide', zh: '页' },
  'Print Prep': { en: 'Print Prep', zh: '印前准备' },
  'Bleed (mm)': { en: 'Bleed (mm)', zh: '出血 (mm)' },
  'Crop marks': { en: 'Crop marks', zh: '裁切标记' },
  'Registration marks': { en: 'Registration marks', zh: '套准标记' },
  'Page info': { en: 'Page info', zh: '页面信息' },

  // -------- Confirm dialog --------
  'Confirm': { en: 'Confirm', zh: '确认' },
  'OK': { en: 'OK', zh: '确定' },
  'New document': { en: 'New document', zh: '新建文档' },
  'Clear': { en: 'Clear', zh: '清空' },

  // -------- Layers panel tooltips --------
  'Hide': { en: 'Hide', zh: '隐藏' },
  'Show': { en: 'Show', zh: '显示' },
  'Lock': { en: 'Lock', zh: '锁定' },
  'Unlock': { en: 'Unlock', zh: '解锁' },

  // -------- Command palette --------
  'Command Palette…': { en: 'Command Palette…', zh: '命令面板…' },
  'Type a command or search…': { en: 'Type a command or search…', zh: '输入命令或搜索…' },
  'Tool': { en: 'Tool', zh: '工具' },
  'Window': { en: 'Window', zh: '窗口' },
  'No commands match': { en: 'No commands match', zh: '没有匹配的命令' },

  // -------- Misc shipped after the initial i18n pass --------
  'Export PDF (Vector)': { en: 'Export PDF (Vector)', zh: '导出 PDF (矢量)' },
  'Deselect': { en: 'Deselect', zh: '取消选择' },
  'Select All': { en: 'Select All', zh: '全选' },
  'Actual Size': { en: 'Actual Size', zh: '实际大小' },
  'Click to set, Shift-click to fit': { en: 'Click to set, Shift-click to fit', zh: '单击编辑，Shift-单击适应页面' },
  'Try a different keyword — tool, file, edit, view, AI…': {
    en: 'Try a different keyword — tool, file, edit, view, AI…',
    zh: '换个关键词试试 — 工具、文件、编辑、视图、AI…',
  },
  'Try a shorter or different keyword.': {
    en: 'Try a shorter or different keyword.',
    zh: '试试更短或不同的关键词。',
  },
  'Outline View': { en: 'Outline View', zh: '轮廓视图' },
  'Toggle Theme': { en: 'Toggle Theme', zh: '切换主题' },
  'Repeat (Grid / Radial / Mirror)…': { en: 'Repeat (Grid / Radial / Mirror)…', zh: '重复（网格 / 径向 / 镜像）…' },

  // -------- AlignPanel: Mask / Compound section --------
  'Mask / Compound': { en: 'Mask / Compound', zh: '蒙版 / 复合路径' },
  'Make Clip Mask': { en: 'Make Clip Mask', zh: '创建剪贴蒙版' },
  'Release Clip Mask': { en: 'Release Clip Mask', zh: '释放剪贴蒙版' },
  'Compound Path': { en: 'Compound Path', zh: '复合路径' },
  'Release Compound': { en: 'Release Compound', zh: '释放复合路径' },
  'Use the top selected object to clip the others':
    { en: 'Use the top selected object to clip the others', zh: '用顶层对象作为蒙版裁切下层' },
  'Remove clip masks from the selection':
    { en: 'Remove clip masks from the selection', zh: '从选区移除剪贴蒙版' },
  'Merge 2+ paths into a single compound path (even-odd fill)':
    { en: 'Merge 2+ paths into a single compound path (even-odd fill)', zh: '合并 2+ 路径为单个复合路径（even-odd 填充）' },
  'Split a compound path back into individual paths':
    { en: 'Split a compound path back into individual paths', zh: '将复合路径拆分为独立路径' },

  // -------- Help Center: dialog chrome --------
  'Help Center': { en: 'Help Center', zh: '帮助中心' },
  'Command Palette': { en: 'Command Palette', zh: '命令面板' },
  'Available commands': { en: 'Available commands', zh: '可用命令' },
  'No commands found.': { en: 'No commands found.', zh: '没有找到命令。' },
  'navigate': { en: 'navigate', zh: '移动' },
  'run': { en: 'run', zh: '执行' },
  'No objects yet': { en: 'No objects yet', zh: '暂无对象' },
  'Draw something with the toolbar — each shape will appear here.': {
    en: 'Draw something with the toolbar — each shape will appear here.',
    zh: '用左侧工具绘制图形，每个形状都会出现在这里。',
  },
  'No assets yet': { en: 'No assets yet', zh: '暂无素材' },
  'Design with Claude': { en: 'Design with Claude', zh: '用 Claude 设计' },
  'Snap': { en: 'Snap', zh: '吸附' },
  'Guides': { en: 'Guides', zh: '参考线' },
  'Repeat': { en: 'Repeat', zh: '重复' },
  'Cols': { en: 'Cols', zh: '列' },
  'Rows': { en: 'Rows', zh: '行' },
  'dx (px)': { en: 'dx (px)', zh: 'dx (px)' },
  'dy (px)': { en: 'dy (px)', zh: 'dy (px)' },
  'Count': { en: 'Count', zh: '数量' },
  'Radius (px)': { en: 'Radius (px)', zh: '半径 (px)' },
  'Start °': { en: 'Start °', zh: '起始 °' },
  'End °': { en: 'End °', zh: '终止 °' },
  'Horizontal (flip X)': { en: 'Horizontal (flip X)', zh: '水平（沿 X 翻转）' },
  'Vertical (flip Y)': { en: 'Vertical (flip Y)', zh: '垂直（沿 Y 翻转）' },
  'Both (4-way kaleidoscope)': { en: 'Both (4-way kaleidoscope)', zh: '双向（四向万花筒）' },
  'Rotate instances': { en: 'Rotate instances', zh: '同步旋转副本' },
  'instances': { en: 'instances', zh: '个副本' },
  'Select an object first.': { en: 'Select an object first.', zh: '请先选中一个对象。' },
  'object': { en: 'object', zh: '个对象' },
  'objects': { en: 'objects', zh: '个对象' },
  'Applying…': { en: 'Applying…', zh: '应用中…' },
  'Select 2 or more objects first': { en: 'Select 2 or more objects first', zh: '请先选中两个或以上对象' },
  'Templates': { en: 'Templates', zh: '模板' },
  'Business Card': { en: 'Business Card', zh: '名片' },
  '90×54 mm card with name, title and accent corner.': { en: '90×54 mm card with name, title and accent corner.', zh: '90×54 mm 名片，含姓名、职位与角部色块。' },
  'Square Social Post': { en: 'Square Social Post', zh: '方形社交贴文' },
  '600×600 layout with bold headline and decorative shapes.': { en: '600×600 layout with bold headline and decorative shapes.', zh: '600×600 布局，配粗体标题与装饰形状。' },
  'Mountain Logo': { en: 'Mountain Logo', zh: '山形 Logo' },
  'Two-tone mountain monogram, centered.': { en: 'Two-tone mountain monogram, centered.', zh: '双色山形组合标识，居中布局。' },
  'Poster A4': { en: 'Poster A4', zh: 'A4 海报' },
  'A4 poster with big headline, subhead and accent block.': { en: 'A4 poster with big headline, subhead and accent block.', zh: 'A4 海报，含主标题、副标题与色块。' },
  'Sticker Pack': { en: 'Sticker Pack', zh: '贴纸包' },
  'A grid of six colorful sticker discs with emoji labels.': { en: 'A grid of six colorful sticker discs with emoji labels.', zh: '六枚多彩贴纸网格，含表情标签。' },
  'Canvas': { en: 'Canvas', zh: '画布' },
  'Character': { en: 'Character', zh: '字符' },
  'Canvas helpers': { en: 'Canvas helpers', zh: '画布辅助' },
  'Toggle Debug': { en: 'Toggle Debug', zh: '切换调试面板' },
  'Open AI Panel': { en: 'Open AI Panel', zh: '打开 AI 面板' },
  'No selection': { en: 'No selection', zh: '未选中对象' },
  'File / View': { en: 'File / View', zh: '文件 / 视图' },
  'Topic': { en: 'Topic', zh: '主题' },
  'AI prompt copied — paste it into the AI panel.': {
    en: 'AI prompt copied — paste it into the AI panel.',
    zh: '已复制 AI 提示词——粘贴到 AI 面板即可使用。',
  },
  'Text on Path': { en: 'Text on Path', zh: '路径文字' },
  'Place text along the selected path': {
    en: 'Place text along the selected path',
    zh: '将文字沿选中路径排列',
  },
  'Select one text + one path to enable': {
    en: 'Select one text + one path to enable',
    zh: '选中一个文本与一条路径以启用',
  },
  'Help Center…': { en: 'Help Center…', zh: '帮助中心…' },
  'Open Help Center': { en: 'Open Help Center', zh: '打开帮助中心' },
  'Search topics…': { en: 'Search topics…', zh: '搜索主题…' },
  'No topics match': { en: 'No topics match', zh: '没有匹配的主题' },

  // -------- Help Center: category labels --------
  'Getting started': { en: 'Getting started', zh: '入门指南' },
  'Drawing & paths': { en: 'Drawing & paths', zh: '绘制与路径' },
  'Styling': { en: 'Styling', zh: '样式' },
  'Layers & layout': { en: 'Layers & layout', zh: '图层与排版' },
  'AI assistant': { en: 'AI assistant', zh: 'AI 助手' },
  'Plotter & cutter': { en: 'Plotter & cutter', zh: '绘图仪与切割机' },
  'Printing': { en: 'Printing', zh: '打印' },
  'Save & restore': { en: 'Save & restore', zh: '保存与恢复' },
  'Accessibility': { en: 'Accessibility', zh: '辅助功能' },

  // -------- Help Center: topic titles --------
  'Welcome': { en: 'Welcome', zh: '欢迎' },
  'Workspace tour': { en: 'Workspace tour', zh: '工作区导览' },
  'First drawing': { en: 'First drawing', zh: '第一次绘制' },
  'Select tool': { en: 'Select tool', zh: '选择工具' },
  'Shape tools': { en: 'Shape tools', zh: '形状工具' },
  'Pen tool': { en: 'Pen tool', zh: '钢笔工具' },
  'Pencil tool': { en: 'Pencil tool', zh: '铅笔工具' },
  'Eraser tool': { en: 'Eraser tool', zh: '橡皮工具' },
  'Eraser': { en: 'Eraser', zh: '橡皮' },
  'Direct Select': { en: 'Direct Select', zh: '直接选择' },
  'You': { en: 'You', zh: '你' },
  'Assistant': { en: 'Assistant', zh: '助手' },
  'Native shell (Tauri)': { en: 'Native shell (Tauri)', zh: '原生外壳 (Tauri)' },
  'Web / PWA': { en: 'Web / PWA', zh: '网页 / PWA' },
  'No fonts match “{q}”. Try a shorter or different keyword.': { en: 'No fonts match “{q}”. Try a shorter or different keyword.', zh: '没有匹配「{q}」的字体。请尝试更短或不同的关键词。' },
  'No fonts available.': { en: 'No fonts available.', zh: '暂无可用字体。' },
  'No matching fonts': { en: 'No matching fonts', zh: '没有匹配的字体' },
  'No fonts available': { en: 'No fonts available', zh: '暂无可用字体' },
  'Upload a TTF/OTF or check back later.': { en: 'Upload a TTF/OTF or check back later.', zh: '请上传 TTF/OTF 字体文件，或稍后再试。' },
  '(+/- to resize)': { en: '(+/- to resize)', zh: '(+/- 调整大小)' },
  'Text tool': { en: 'Text tool', zh: '文字工具' },
  'Hand tool': { en: 'Hand tool', zh: '抓手工具' },
  'Zoom tool': { en: 'Zoom tool', zh: '缩放工具' },
  'Bezier handles': { en: 'Bezier handles', zh: '贝塞尔手柄' },
  'Anchor edit': { en: 'Anchor edit', zh: '锚点编辑' },
  'Boolean operations': { en: 'Boolean operations', zh: '布尔运算' },
  'Compound paths': { en: 'Compound paths', zh: '复合路径' },
  'Clip masks': { en: 'Clip masks', zh: '剪切蒙版' },
  'Fill & stroke': { en: 'Fill & stroke', zh: '填充与描边' },
  'Gradients': { en: 'Gradients', zh: '渐变' },
  'Drop shadows': { en: 'Drop shadows', zh: '投影' },
  'SVG filters': { en: 'SVG filters', zh: 'SVG 滤镜' },
  'Pattern fills': { en: 'Pattern fills', zh: '图案填充' },
  'Pattern Fill': { en: 'Pattern Fill', zh: '图案填充' },
  'Pattern': { en: 'Pattern', zh: '图案' },
  'Pattern kind': { en: 'Pattern kind', zh: '图案类型' },
  'Pattern size': { en: 'Pattern size', zh: '图案大小' },
  'Pattern color 1 swatch': { en: 'Pattern color 1 swatch', zh: '图案颜色 1 色块' },
  'Pattern color 1 value': { en: 'Pattern color 1 value', zh: '图案颜色 1 值' },
  'Pattern color 2 swatch': { en: 'Pattern color 2 swatch', zh: '图案颜色 2 色块' },
  'Pattern color 2 value': { en: 'Pattern color 2 value', zh: '图案颜色 2 值' },
  'Shadow color swatch': { en: 'Shadow color swatch', zh: '阴影颜色色块' },
  'Shadow color value': { en: 'Shadow color value', zh: '阴影颜色值' },
  'Shadow blur': { en: 'Shadow blur', zh: '阴影模糊' },
  'Shadow offset X': { en: 'Shadow offset X', zh: '阴影 X 偏移' },
  'Shadow offset Y': { en: 'Shadow offset Y', zh: '阴影 Y 偏移' },
  'Filter blur amount': { en: 'Filter blur amount', zh: '滤镜模糊度' },
  'Filter brightness': { en: 'Filter brightness', zh: '滤镜亮度' },
  'Filter contrast': { en: 'Filter contrast', zh: '滤镜对比度' },
  'Filter hue rotation': { en: 'Filter hue rotation', zh: '滤镜色相旋转' },
  'Color 1': { en: 'Color 1', zh: '颜色 1' },
  'Color 2': { en: 'Color 2', zh: '颜色 2' },
  'Size': { en: 'Size', zh: '尺寸' },
  'Checker': { en: 'Checker', zh: '棋盘' },
  'Stripes': { en: 'Stripes', zh: '条纹' },
  'Dots': { en: 'Dots', zh: '圆点' },
  'Crosshatch': { en: 'Crosshatch', zh: '交叉线' },
  'Apply pattern': { en: 'Apply pattern', zh: '应用图案' },
  'Color picker': { en: 'Color picker', zh: '颜色拾取器' },
  'Fonts & uploads': { en: 'Fonts & uploads', zh: '字体与上传' },
  'Character panel': { en: 'Character panel', zh: '字符面板' },
  'Text on path': { en: 'Text on path', zh: '路径文字' },
  'Contrast check': { en: 'Contrast check', zh: '对比度检查' },
  'Layers panel': { en: 'Layers panel', zh: '图层面板' },
  'Artboards': { en: 'Artboards', zh: '画板' },
  'Append a new artboard': { en: 'Append a new artboard', zh: '追加一个画板' },
  'Add Artboard': { en: 'Add Artboard', zh: '添加画板' },
  'No artboards yet': { en: 'No artboards yet', zh: '还没有画板' },
  'Click "Add Artboard" above to lay out multiple pages side-by-side.': {
    en: 'Click "Add Artboard" above to lay out multiple pages side-by-side.',
    zh: '点击上方的"添加画板"，可横向排列多个页面。',
  },
  'Artboard name': { en: 'Artboard name', zh: '画板名称' },
  'Layer name': { en: 'Layer name', zh: '图层名称' },
  'Layer list': { en: 'Layer list', zh: '图层列表' },
  'Finish path': { en: 'Finish path', zh: '完成路径' },
  'Close path': { en: 'Close path', zh: '闭合路径' },
  'Quick help': { en: 'Quick help', zh: '快速帮助' },
  'press F1 for the full Help Center': {
    en: 'press F1 for the full Help Center',
    zh: '按 F1 打开完整帮助中心',
  },
  'All shortcuts': { en: 'All shortcuts', zh: '全部快捷键' },
  'Zoom: scroll wheel · pinch trackpad': {
    en: 'Zoom: scroll wheel · pinch trackpad',
    zh: '缩放：滚轮 · 触控板捏合',
  },
  'Pan: middle-mouse drag · hold Space + drag': {
    en: 'Pan: middle-mouse drag · hold Space + drag',
    zh: '平移：鼠标中键拖动 · 按住空格 + 拖动',
  },
  'Fit page to view': { en: 'Fit page to view', zh: '页面适合窗口' },
  'Open Command Palette': { en: 'Open Command Palette', zh: '打开命令面板' },
  'Save project': { en: 'Save project', zh: '保存项目' },
  'Group / Ungroup': { en: 'Group / Ungroup', zh: '编组 / 取消编组' },
  'Nudge selection (Shift for 10px)': {
    en: 'Nudge selection (Shift for 10px)',
    zh: '微移选区（按住 Shift 步进 10px）',
  },
  'Open AI assistant': { en: 'Open AI assistant', zh: '打开 AI 助手' },
  'Full keyboard shortcut list': {
    en: 'Full keyboard shortcut list',
    zh: '完整键盘快捷键列表',
  },
  'Use arrow keys to navigate, F2 to rename, Delete to remove.': {
    en: 'Use arrow keys to navigate, F2 to rename, Delete to remove.',
    zh: '使用方向键浏览，F2 重命名，Delete 删除。',
  },
  'Scalable Vector Graphics — round-trips with all path data preserved.': {
    en: 'Scalable Vector Graphics — round-trips with all path data preserved.',
    zh: '可缩放矢量图形 — 路径数据无损往返。',
  },
  '2× DPI lossless raster — best for handing off to non-vector tools.': {
    en: '2× DPI lossless raster — best for handing off to non-vector tools.',
    zh: '2 倍 DPI 无损位图 — 适合交给非矢量工具。',
  },
  'Compressed raster — small file, lossy.': {
    en: 'Compressed raster — small file, lossy.',
    zh: '压缩位图 — 文件小，有损。',
  },
  'Fabric canvas state — round-trips objects but loses artboards & symbols.': {
    en: 'Fabric canvas state — round-trips objects but loses artboards & symbols.',
    zh: 'Fabric 画布状态 — 对象往返保留，画板与符号会丢失。',
  },
  'PDF via the browser print dialog (use Print Prep dialog for crop / bleed / registration marks).': {
    en: 'PDF via the browser print dialog (use Print Prep dialog for crop / bleed / registration marks).',
    zh: '通过浏览器打印对话框导出 PDF（裁切线 / 出血 / 套准标记请使用印前对话框）。',
  },
  'Real vector PDF — fonts and paths stay editable in PDF readers.': {
    en: 'Real vector PDF — fonts and paths stay editable in PDF readers.',
    zh: '真正的矢量 PDF — 字体与路径在 PDF 阅读器中保持可编辑。',
  },
  'AutoCAD DXF — LINE / LWPOLYLINE entities only, curves flattened, no text or hatching.': {
    en: 'AutoCAD DXF — LINE / LWPOLYLINE entities only, curves flattened, no text or hatching.',
    zh: 'AutoCAD DXF — 仅支持 LINE / LWPOLYLINE 实体，曲线展平，不含文本或填充。',
  },
  'Delete artboard': { en: 'Delete artboard', zh: '删除画板' },
  'Export this artboard as PNG': { en: 'Export this artboard as PNG', zh: '将此画板导出为 PNG' },
  'Export this artboard as SVG': { en: 'Export this artboard as SVG', zh: '将此画板导出为 SVG' },
  'Symbols': { en: 'Symbols', zh: '符号' },
  'Save Selection as Symbol': { en: 'Save Selection as Symbol', zh: '将选区保存为符号' },
  'No symbols yet': { en: 'No symbols yet', zh: '还没有符号' },
  'Select shape(s) and use "Save Selection" above to make them reusable.': {
    en: 'Select shape(s) and use "Save Selection" above to make them reusable.',
    zh: '选中形状后点击上方的"将选区保存为符号"，让其可复用。',
  },
  'Save the current selection as a reusable symbol': {
    en: 'Save the current selection as a reusable symbol',
    zh: '将当前选区另存为可复用的符号',
  },
  'Symbol name': { en: 'Symbol name', zh: '符号名称' },
  'Save symbol': { en: 'Save symbol', zh: '保存符号' },
  'Save (Enter)': { en: 'Save (Enter)', zh: '保存 (Enter)' },
  'Cancel (Esc)': { en: 'Cancel (Esc)', zh: '取消 (Esc)' },
  'click to insert, double-click to rename': {
    en: 'click to insert, double-click to rename',
    zh: '单击插入，双击重命名',
  },
  'Delete symbol': { en: 'Delete symbol', zh: '删除符号' },
  'Select one or more objects on the canvas first.': {
    en: 'Select one or more objects on the canvas first.',
    zh: '请先在画布上选择一个或多个对象。',
  },
  'Align & distribute': { en: 'Align & distribute', zh: '对齐与分布' },
  'Smart guides': { en: 'Smart guides', zh: '智能参考线' },
  'Drag-drop import': { en: 'Drag-drop import', zh: '拖拽导入' },
  'Image trace': { en: 'Image trace', zh: '图像描摹' },
  'Asset library': { en: 'Asset library', zh: '素材库' },
  'Built-in templates': { en: 'Built-in templates', zh: '内置模板' },
  'AI setup': { en: 'AI setup', zh: 'AI 设置' },
  'AI vision': { en: 'AI vision', zh: 'AI 视觉' },
  'Tools & skills': { en: 'Tools & skills', zh: '工具与技能' },
  'MCP servers': { en: 'MCP servers', zh: 'MCP 服务器' },
  'Quick actions': { en: 'Quick actions', zh: '快捷操作' },
  'G-code output': { en: 'G-code output', zh: 'G 代码输出' },
  'HP-GL output': { en: 'HP-GL output', zh: 'HP-GL 输出' },
  'Web Serial USB': { en: 'Web Serial USB', zh: 'Web Serial USB' },
  'Plotter options': { en: 'Plotter options', zh: '绘图仪选项' },
  'Page sizes': { en: 'Page sizes', zh: '页面尺寸' },
  'Bleed & margins': { en: 'Bleed & margins', zh: '出血与边距' },
  'Tile print': { en: 'Tile print', zh: '分页打印' },
  'Autosave': { en: 'Autosave', zh: '自动保存' },
  'Project files': { en: 'Project files', zh: '项目文件' },
  'Recovery': { en: 'Recovery', zh: '恢复' },
  'Keyboard shortcuts': { en: 'Keyboard shortcuts', zh: '键盘快捷键' },
  'Full shortcut reference': { en: 'Full shortcut reference', zh: '完整快捷键参考' },
  'Accessibility features': { en: 'Accessibility features', zh: '辅助功能' },

  // -------- Save indicator / autosave --------
  'Saved just now': { en: 'Saved just now', zh: '刚刚已保存' },
  'Unsaved changes': { en: 'Unsaved changes', zh: '有未保存的更改' },
  'Not saved yet': { en: 'Not saved yet', zh: '尚未保存' },
  'Saved Ns ago': { en: 'Saved {n}s ago', zh: '{n} 秒前已保存' },
  'Saved Nm ago': { en: 'Saved {n}m ago', zh: '{n} 分钟前已保存' },
  'Saved Nh ago': { en: 'Saved {n}h ago', zh: '{n} 小时前已保存' },
  'Saved Nd ago': { en: 'Saved {n}d ago', zh: '{n} 天前已保存' },
  'just now': { en: 'just now', zh: '刚刚' },
  'Nm ago': { en: '{n}m ago', zh: '{n} 分钟前' },
  'Nh ago': { en: '{n}h ago', zh: '{n} 小时前' },
  'Nd ago': { en: '{n}d ago', zh: '{n} 天前' },
  'Nw ago': { en: '{n}w ago', zh: '{n} 周前' },
  'Nmo ago': { en: '{n}mo ago', zh: '{n} 个月前' },
  'Ny ago': { en: '{n}y ago', zh: '{n} 年前' },

  // -------- File menu: project files --------
  'Save Project': { en: 'Save Project', zh: '保存项目' },
  'Save Project As…': { en: 'Save Project As…', zh: '另存项目…' },
  'Open Project…': { en: 'Open Project…', zh: '打开项目…' },
  'Saved': { en: 'Saved', zh: '已保存' },
  'Opened': { en: 'Opened', zh: '已打开' },
  'Exported': { en: 'Exported', zh: '已导出' },
  'Save failed': { en: 'Save failed', zh: '保存失败' },
  'Open failed': { en: 'Open failed', zh: '打开失败' },
  'project': { en: 'project', zh: '项目' },
  'Pick this file in the picker to reopen it:': {
    en: 'Pick this file in the picker to reopen it:',
    zh: '请在文件选择器中选择此文件以重新打开：',
  },

  // -------- Inspect panel --------
  'Inspect': { en: 'Inspect', zh: '检查' },
  'Bounds': { en: 'Bounds', zh: '边界' },
  'Path length': { en: 'Path length', zh: '路径长度' },
  'Total area': { en: 'Total area', zh: '总面积' },
  'SVG size': { en: 'SVG size', zh: 'SVG 大小' },
  'Group depth': { en: 'Group depth', zh: '编组深度' },
  'Copied': { en: 'Copied', zh: '已复制' },
  'Clipboard unavailable': { en: 'Clipboard unavailable', zh: '剪贴板不可用' },
  'Clipboard unavailable — the AI panel is open; paste manually.': { en: 'Clipboard unavailable — the AI panel is open; paste manually.', zh: '剪贴板不可用 — AI 面板已打开，请手动粘贴。' },
  'No objects on canvas': { en: 'No objects on canvas', zh: '画布上还没有对象' },
  'No colors in use': { en: 'No colors in use', zh: '没有使用任何颜色' },
  'Palette': { en: 'Palette', zh: '色板' },
  'Deepest group nesting': { en: 'Deepest group nesting', zh: '最深编组嵌套层级' },
  'Copy color': { en: 'Copy color', zh: '复制颜色' },
  'Use color': { en: 'Use color', zh: '使用颜色' },

  // -------- Contrast checker --------
  'Contrast': { en: 'Contrast', zh: '对比度' },
  'Contrast ratio (WCAG)': { en: 'Contrast ratio (WCAG)', zh: '对比度（WCAG）' },
  'Preview': { en: 'Preview', zh: '预览' },
  'WCAG AA — normal text (≥ 4.5:1)': {
    en: 'WCAG AA — normal text (≥ 4.5:1)',
    zh: 'WCAG AA — 正文（≥ 4.5:1）',
  },
  'WCAG AAA — normal text (≥ 7:1)': {
    en: 'WCAG AAA — normal text (≥ 7:1)',
    zh: 'WCAG AAA — 正文（≥ 7:1）',
  },
  'WCAG AA — large text (≥ 3:1)': {
    en: 'WCAG AA — large text (≥ 3:1)',
    zh: 'WCAG AA — 大字号（≥ 3:1）',
  },
  'WCAG AAA — large text (≥ 4.5:1)': {
    en: 'WCAG AAA — large text (≥ 4.5:1)',
    zh: 'WCAG AAA — 大字号（≥ 4.5:1）',
  },
  'AA': { en: 'AA', zh: 'AA' },
  'AAA': { en: 'AAA', zh: 'AAA' },
  'AA Large': { en: 'AA Large', zh: 'AA 大字号' },
  'AAA Large': { en: 'AAA Large', zh: 'AAA 大字号' },
  'Excellent': { en: 'Excellent', zh: '极佳' },
  'Good': { en: 'Good', zh: '良好' },
  'Fair': { en: 'Fair', zh: '一般' },
  'Fail': { en: 'Fail', zh: '不达标' },
  'pass': { en: 'pass', zh: '通过' },
  'fail': { en: 'fail', zh: '未通过' },

  // -------- High contrast theme --------
  'High Contrast': { en: 'High Contrast', zh: '高对比度' },

  // -------- Light / dark theme --------
  'Light Theme': { en: 'Light Theme', zh: '浅色主题' },
  'Dark Theme': { en: 'Dark Theme', zh: '深色主题' },

  // -------- Onboarding tail --------
  'to open the Help Center anytime.': { en: 'to open the Help Center anytime.', zh: '随时打开帮助中心。' },

  // -------- Preferences dialog --------
  'Preferences': { en: 'Preferences', zh: '偏好设置' },
  'Preferences…': { en: 'Preferences…', zh: '偏好设置…' },
  'Open Preferences…': { en: 'Open Preferences…', zh: '打开偏好设置…' },
  'General': { en: 'General', zh: '通用' },
  'Editor': { en: 'Editor', zh: '编辑器' },
  'Workspace': { en: 'Workspace', zh: '工作区' },
  'Default canvas size': { en: 'Default canvas size', zh: '默认画布尺寸' },
  'Width': { en: 'Width', zh: '宽度' },
  'Height': { en: 'Height', zh: '高度' },
  'Editor status': { en: 'Editor status', zh: '编辑器状态' },
  'Active tool': { en: 'Active tool', zh: '当前工具' },
  'Cursor': { en: 'Cursor', zh: '光标' },
  'Autosave interval (seconds)': { en: 'Autosave interval (seconds)', zh: '自动保存间隔（秒）' },
  'API key': { en: 'API key', zh: 'API 密钥' },
  'Please set your Anthropic API key in the AI panel.': {
    en: 'Please set your Anthropic API key in the AI panel.',
    zh: '请先在 AI 面板中设置你的 Anthropic API 密钥。',
  },
  'Stream responses': { en: 'Stream responses', zh: '流式返回' },
  'Default theme': { en: 'Default theme', zh: '默认主题' },
  'System': { en: 'System', zh: '系统' },
  'High contrast': { en: 'High contrast', zh: '高对比度' },

  // -------- Keymap editor --------
  'Customize Shortcuts…':       { en: 'Customize Shortcuts…',       zh: '自定义快捷键…' },
  'Press a key combination…':   { en: 'Press a key combination…',   zh: '请按下快捷键…' },
  'Reset':                      { en: 'Reset',                      zh: '重置' },
  'Reset All':                  { en: 'Reset All',                  zh: '全部重置' },
  'Action':                     { en: 'Action',                     zh: '操作' },
  'Shortcut':                   { en: 'Shortcut',                   zh: '快捷键' },
  'Default':                    { en: 'Default',                    zh: '默认' },
  'Click to rebind':            { en: 'Click to rebind',            zh: '点击重新绑定' },
  'Rebind':                     { en: 'Rebind',                     zh: '重新绑定' },
  // Binding-label keys used by KeymapEditor via t(b.label).
  'Redo (Shift+Z)':                 { en: 'Redo (Shift+Z)',                 zh: '重做 (Shift+Z)' },
  'Bring Forward / to Front':       { en: 'Bring Forward / to Front',       zh: '上移一层 / 置于顶层' },
  'Send Backward / to Back':        { en: 'Send Backward / to Back',        zh: '下移一层 / 置于底层' },

  // -------- Help Center: post-Wave-10 categories --------
  // 'View' and 'Preferences' are already defined above and reused here.
  'Platform': { en: 'Platform', zh: '平台' },
};

/** Non-React lookup. Falls back to the key (English) when missing. */
export function t(k: string): string {
  return dict[k]?.[useI18n.getState().lang] ?? k;
}

/**
 * React hook returning a translator bound to the current language.
 * Components calling `useT()` automatically re-render when the language
 * changes, because `useI18n(s => s.lang)` is a Zustand subscription.
 */
export function useT(): (k: string) => string {
  const lang = useI18n((s) => s.lang);
  return (k: string) => dict[k]?.[lang] ?? k;
}
