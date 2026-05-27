import { create } from 'zustand';
import type { DocSettings, FillStroke, LayerInfo, ToolId, ShadowSettings, Artboard } from '../types';

/**
 * Pick the initial theme: explicit user choice in localStorage wins, then
 * the OS `prefers-color-scheme` hint, finally a dark fallback. SSR-safe.
 */
function readInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem('vs:theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* localStorage blocked — fall through to media query */ }
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function readInitialHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem('vs:hc');
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch { /* localStorage blocked — fall through to media query */ }
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-contrast: more)').matches) {
    return true;
  }
  return false;
}

interface EditorState {
  tool: ToolId;
  setTool: (t: ToolId) => void;

  doc: DocSettings;
  setDoc: (d: Partial<DocSettings>) => void;

  zoom: number;
  setZoom: (z: number) => void;

  style: FillStroke;
  setStyle: (s: Partial<FillStroke>) => void;

  shadow: ShadowSettings;
  setShadow: (s: Partial<ShadowSettings>) => void;

  palette: string[];
  setPalette: (p: string[]) => void;

  layers: LayerInfo[];
  activeLayerId: string | null;
  setLayers: (l: LayerInfo[]) => void;
  setActiveLayer: (id: string | null) => void;

  selectionIds: string[];
  setSelectionIds: (ids: string[]) => void;

  // Object summary for properties panel
  selectionSummary: null | {
    count: number;
    left: number;
    top: number;
    width: number;
    height: number;
    angle: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
    type: string;
  };
  setSelectionSummary: (s: EditorState['selectionSummary']) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  setHistoryFlags: (u: boolean, r: boolean) => void;

  // Modal flags
  showPlotter: boolean;
  showPrint: boolean;
  showDocSettings: boolean;
  showTemplates: boolean;
  showShortcuts: boolean;
  showCommandPalette: boolean;
  showHelpCenter: boolean;
  showRepeat: boolean;
  showPreferences: boolean;
  showKeymapEditor: boolean;
  setModal: (k: 'showPlotter' | 'showPrint' | 'showDocSettings' | 'showTemplates' | 'showShortcuts' | 'showCommandPalette' | 'showHelpCenter' | 'showRepeat' | 'showPreferences' | 'showKeymapEditor', v: boolean) => void;

  // Grid / snap / smart guides
  gridVisible: boolean;
  gridSize: number;
  snapEnabled: boolean;
  smartGuidesEnabled: boolean;
  // Snap moving objects to anchor points (corners, midpoints, centers, path
  // command end-points) of other objects on the canvas. Orthogonal to grid
  // snap and smart-edge guides; layered on top during onObjectMoving.
  anchorSnapEnabled: boolean;
  setGridVisible: (v: boolean) => void;
  setGridSize: (n: number) => void;
  setSnapEnabled: (v: boolean) => void;
  setSmartGuidesEnabled: (v: boolean) => void;
  setAnchorSnapEnabled: (v: boolean) => void;

  // Cursor position (document coords)
  cursorX: number;
  cursorY: number;
  setCursor: (x: number, y: number) => void;

  // Object count for status bar
  objectCount: number;
  setObjectCount: (n: number) => void;

  // Accessibility: high contrast theme toggle (applied via data attr on <html>)
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;

  // Light / dark theme — orthogonal to high-contrast (high-contrast always
  // wins when on). Persisted to localStorage and applied as
  // `data-theme="light" | "dark"` on <html> by App.tsx.
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;

  // Artboards (multiple "pages" overlayed on the canvas)
  artboards: Artboard[];
  setArtboards: (a: Artboard[]) => void;

  // Eraser tool brush size (document pixels). Adjustable via `+`/`-` while
  // the eraser is active, or programmatically via the `set_eraser_size` skill.
  eraserSize: number;
  setEraserSize: (n: number) => void;

  // Illustrator-style "Outline view" — when on, every object on the canvas
  // is drawn as a thin wireframe. Session-only; not persisted.
  outlineMode: boolean;
  setOutlineMode: (v: boolean) => void;
}

export const useEditor = create<EditorState>((set) => ({
  tool: 'select',
  setTool: (t) => set({ tool: t }),

  doc: { width: 800, height: 600, unit: 'px', dpi: 96, background: '#ffffff' },
  setDoc: (d) => set((s) => ({ doc: { ...s.doc, ...d } })),

  zoom: 1,
  setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(32, z)) }),

  style: { fill: '#3d9bff', stroke: '#0f0f12', strokeWidth: 1, opacity: 1 },
  setStyle: (s) => set((st) => ({ style: { ...st.style, ...s } })),

  shadow: { enabled: false, color: '#000000', blur: 12, offsetX: 4, offsetY: 4 },
  setShadow: (s) => set((st) => ({ shadow: { ...st.shadow, ...s } })),

  palette: [],
  setPalette: (p) => set({ palette: p }),

  layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }],
  activeLayerId: 'layer-1',
  setLayers: (l) => set({ layers: l }),
  setActiveLayer: (id) => set({ activeLayerId: id }),

  selectionIds: [],
  setSelectionIds: (ids) => set({ selectionIds: ids }),

  selectionSummary: null,
  setSelectionSummary: (s) => set({ selectionSummary: s }),

  canUndo: false,
  canRedo: false,
  setHistoryFlags: (u, r) => set({ canUndo: u, canRedo: r }),

  showPlotter: false,
  showPrint: false,
  showDocSettings: false,
  showTemplates: false,
  showShortcuts: false,
  showCommandPalette: false,
  showHelpCenter: false,
  showRepeat: false,
  showPreferences: false,
  showKeymapEditor: false,
  setModal: (k, v) => set({ [k]: v } as Partial<EditorState>),

  gridVisible: false,
  gridSize: 20,
  snapEnabled: false,
  smartGuidesEnabled: true,
  anchorSnapEnabled: true,
  setGridVisible: (v) => set({ gridVisible: v }),
  setGridSize: (n) => set({ gridSize: Math.max(2, Math.min(500, n)) }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSmartGuidesEnabled: (v) => set({ smartGuidesEnabled: v }),
  setAnchorSnapEnabled: (v) => set({ anchorSnapEnabled: v }),

  cursorX: 0,
  cursorY: 0,
  setCursor: (x, y) => set({ cursorX: x, cursorY: y }),

  objectCount: 0,
  setObjectCount: (n) => set({ objectCount: n }),

  // Initial high contrast: explicit user choice in localStorage > OS
  // `prefers-contrast: more` > off. Persistence is handled by the App.tsx
  // useEffect (mirrors theme), so direct setState calls also write through.
  highContrast: readInitialHighContrast(),
  setHighContrast: (v) => set({ highContrast: v }),

  // Initial theme: explicit user choice in localStorage > prefers-color-scheme
  // > dark. Reading prefers-color-scheme during module load is safe because
  // `matchMedia` exists in every modern browser; we guard for SSR anyway.
  theme: readInitialTheme(),
  setTheme: (t) => set({ theme: t }),

  // Default single artboard matching initial document size; the artboards
  // library is responsible for hydrating from localStorage on first read.
  artboards: [{ id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 800, height: 600 }],
  setArtboards: (a) => set({ artboards: a }),

  eraserSize: 20,
  setEraserSize: (n) => set({ eraserSize: Math.max(2, Math.min(400, n)) }),

  outlineMode: false,
  setOutlineMode: (v) => set({ outlineMode: v }),
}));
