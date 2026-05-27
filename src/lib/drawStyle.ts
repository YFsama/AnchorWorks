/**
 * Resolve the editor's current drawing style into a Fabric-compatible options
 * patch. Used by every "start drawing a new shape" code path (rect / ellipse
 * / line / polygon / pen) so the new object inherits the live fill / stroke /
 * stroke-width / opacity from the PropertiesPanel inputs.
 *
 * Lives in its own tiny module because canvasEngine and src/lib/tools/penPolyTool
 * both needed the exact same function and had identical copies. Future tool
 * modules — when shape-drawing is extracted from canvasEngine — will import
 * from here too.
 */

import { useEditor } from '../store/editor';

export interface DrawStyleOpts {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export function getDrawStyle(): DrawStyleOpts {
  const s = useEditor.getState().style;
  return { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, opacity: s.opacity };
}
