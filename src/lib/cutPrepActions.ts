import { useEditor } from '../store/editor';
import { addBridges } from './bridges';
import { generateRegMarks, generateWeedBorder, generateWeedLines } from './cutContour';
import { grommetsFromSelection } from './grommets';
import { getCanvas } from './canvasEngine';
import { rhinestoneFromSelection } from './rhinestone';
import { download } from './io';
import { buildTestCut, defaultPlotterOptions } from './plotter';
import { toast } from './toast';

const MM_TO_PX = 3.7795;

type T = (key: string) => string;
type Bounds = { x: number; y: number; w: number; h: number };

function boundsFromCutPaths(expandMm = 0, excludeWeed = false): Bounds | null {
  const editor = useEditor.getState();
  const geom = editor.cutPaths.filter(p => p.kind !== 'regmark' && (!excludeWeed || !p.id.startsWith('weed-')));
  if (!geom.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const path of geom) {
    for (const [x, y] of path.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return {
    x: minX - expandMm,
    y: minY - expandMm,
    w: maxX - minX + expandMm * 2,
    h: maxY - minY + expandMm * 2,
  };
}

function fallbackBounds(): Bounds {
  const editor = useEditor.getState();
  if (editor.artboards.length) {
    const artboard = editor.artboards[0];
    return {
      x: artboard.x / MM_TO_PX,
      y: artboard.y / MM_TO_PX,
      w: artboard.width / MM_TO_PX,
      h: artboard.height / MM_TO_PX,
    };
  }
  return { x: 0, y: 0, w: 297, h: 210 };
}

export function addPlotterRegistrationMarks(t: T) {
  const editor = useEditor.getState();
  const bounds = boundsFromCutPaths(5) ?? fallbackBounds();
  editor.clearCutPaths('regmark');
  editor.addCutPaths(generateRegMarks({ bounds, armLength: 10, inset: 5 }));
  toast.success(`${t('4-corner registration marks added.')} ${bounds.w.toFixed(0)}×${bounds.h.toFixed(0)} mm`, { title: t('Reg marks') });
}

export function addPlotterWeedBorder(t: T, rows = 0, cols = 0) {
  const editor = useEditor.getState();
  const bounds = boundsFromCutPaths(0, true) ?? fallbackBounds();
  const paths = [generateWeedBorder(bounds, 5)];
  if (rows > 0 || cols > 0) paths.push(...generateWeedLines(bounds, rows, cols, 5));
  editor.addCutPaths(paths);
  toast.success(t('Weed border added.'), { title: t('Weeding') });
}



export function addPlotterGrommets(t: T, insetMm = 20, maxSpacingMm = 500, diameterMm = 10) {
  const paths = grommetsFromSelection(insetMm, maxSpacingMm, diameterMm);
  if (!paths.length) {
    toast.warn(t('Select something first.'), { title: t('Banner Grommets') });
    return 0;
  }
  const editor = useEditor.getState();
  editor.addCutPaths(paths);
  editor.setCutPathsVisible(true);
  toast.success(`${paths.length} ${t('grommets added')}`, { title: t('Banner Grommets') });
  return paths.length;
}



export function addPlotterRhinestones(t: T, diameterMm = 2.8, spacingMm = 4) {
  const objects = getCanvas()?.getActiveObjects() ?? [];
  if (!objects.length) {
    toast.warn(t('Select one or more shapes first.'), { title: t('Rhinestone Template') });
    return 0;
  }
  const paths = rhinestoneFromSelection(objects, spacingMm, diameterMm);
  if (!paths.length) {
    toast.warn(t('No outline to place stones on.'), { title: t('Rhinestone Template') });
    return 0;
  }
  const editor = useEditor.getState();
  editor.addCutPaths(paths);
  editor.setCutPathsVisible(true);
  toast.success(`${paths.length} ${t('stones placed')}`, { title: t('Rhinestone Template') });
  return paths.length;
}


export function addPlotterBridges(t: T, count = 4, gapMm = 1) {
  if (count < 1) {
    toast.warn(t('Choose a bridge preset first.'), { title: t('Bridges') });
    return 0;
  }
  const editor = useEditor.getState();
  const closed = editor.cutPaths.filter(path => path.closed && path.kind !== 'regmark');
  if (!closed.length) {
    toast.warn(t('No closed cut paths to bridge.'), { title: t('Bridges') });
    return 0;
  }
  editor.setCutPaths(addBridges(editor.cutPaths, count, gapMm));
  toast.success(`${closed.length} ${t('paths bridged')}`, { title: t('Bridges') });
  return closed.length;
}


export function clearPlotterBridges(t: T) {
  const editor = useEditor.getState();
  const restored = new Set<string>();
  const paths = [];
  let removed = 0;

  for (const path of editor.cutPaths) {
    if (path.bridgeOriginal && path.bridgeSourceId) {
      removed += 1;
      if (!restored.has(path.bridgeSourceId)) {
        paths.push(path.bridgeOriginal);
        restored.add(path.bridgeSourceId);
      }
    } else {
      paths.push(path);
    }
  }

  if (!removed) {
    toast.warn(t('No bridges to clear.'), { title: t('Bridges') });
    return 0;
  }

  editor.setCutPaths(paths);
  toast.success(`${restored.size} ${t('bridged paths restored')}`, { title: t('Bridges') });
  return restored.size;
}


export function clearPlotterRegistrationMarks(t: T) {
  const editor = useEditor.getState();
  const count = editor.cutPaths.filter(path => path.kind === 'regmark').length;
  if (!count) {
    toast.warn(t('No positioning marks to clear.'), { title: t('Reg marks') });
    return 0;
  }
  editor.clearCutPaths('regmark');
  toast.success(`${count} ${t('positioning marks cleared')}`, { title: t('Reg marks') });
  return count;
}

export function clearPlotterWeedBorders(t: T) {
  const editor = useEditor.getState();
  const count = editor.cutPaths.filter(path => path.id.startsWith('weed-')).length;
  if (!count) {
    toast.warn(t('No weed borders to clear.'), { title: t('Weeding') });
    return 0;
  }
  editor.setCutPaths(editor.cutPaths.filter(path => !path.id.startsWith('weed-')));
  toast.success(`${count} ${t('weed border paths cleared')}`, { title: t('Weeding') });
  return count;
}

export function savePlotterTestCut(t: T) {
  const format = 'hpgl';
  download('test-cut.plt', buildTestCut(format, defaultPlotterOptions), 'text/plain');
  toast.success(t('Test cut file saved.'), { title: t('Test cut') });
}
