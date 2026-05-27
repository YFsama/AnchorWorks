export type ToolId =
  | 'select'
  | 'directSelect'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'pen'
  | 'pencil'
  | 'eraser'
  | 'text'
  | 'hand'
  | 'zoom';

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface DocSettings {
  width: number;
  height: number;
  unit: 'px' | 'mm' | 'in';
  dpi: number;
  background: string;
}

export interface FillStroke {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface ShadowSettings {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolEntry {
  id: string;
  name: string;
  /** Tiny 64×64 PNG data URL. */
  thumbnail: string;
  /** Serialized fabric object(s). Either a single toObject() result or an array. */
  objectsJSON: object;
  addedAt: number;
}
