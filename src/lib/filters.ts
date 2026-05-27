/**
 * SVG / image filter effects.
 *
 * Fabric supports a rich set of image filters out of the box for FabricImage
 * (raster) objects via the `filters` array. For vector objects, applying an
 * arbitrary CSS-style `filter` chain at render time is not directly supported
 * — but we can stash filter metadata on the object so that SVG export
 * (or future renderers) can map it onto an SVG `<filter>` chain.
 *
 * In this module we:
 *  - For FabricImage: push real `fabric.filters.*` instances and call
 *    `applyFilters()` so the canvas reflects the change immediately.
 *  - For vector objects: store a `cssFilters` property (array of
 *    [name, ...args]) that toSVG output can later read. We do NOT mutate
 *    rendering for vector objects — that would require canvas plumbing
 *    we explicitly don't want to touch here.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

type CssFilterTuple = [string, ...(number | string)[]];

interface VectorWithFilters extends fabric.FabricObject {
  cssFilters?: CssFilterTuple[];
}

function isImage(o: fabric.FabricObject): o is fabric.FabricImage {
  return (o as fabric.FabricImage).type === 'image' || o instanceof fabric.FabricImage;
}

function forEachSelected(fn: (o: fabric.FabricObject) => void): boolean {
  const c = getCanvas();
  if (!c) return false;
  const objs = c.getActiveObjects();
  if (!objs.length) return false;
  objs.forEach(fn);
  c.requestRenderAll();
  return true;
}

/** Push or replace a filter instance on an image (matched by class). */
type AnyImageFilter = { constructor: unknown };

function setImageFilter(img: fabric.FabricImage, filter: AnyImageFilter) {
  const ctor = filter.constructor;
  const list = ((img.filters ?? []) as unknown as AnyImageFilter[]);
  const next = list.filter((f) => f.constructor !== ctor);
  next.push(filter);
  img.filters = next as unknown as fabric.FabricImage['filters'];
  img.applyFilters();
}

/** Set or replace a css filter tuple on a vector object (matched by name). */
function setVectorFilter(o: VectorWithFilters, tuple: CssFilterTuple) {
  const list = (o.cssFilters ?? []).filter((t) => t[0] !== tuple[0]);
  list.push(tuple);
  o.cssFilters = list;
}

export function applyBlur(amount: number) {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      setImageFilter(o, new fabric.filters.Blur({ blur: amount }));
    } else {
      setVectorFilter(o as VectorWithFilters, ['blur', amount]);
    }
  });
  if (ok) pushHistory();
}

export function applySepia() {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      setImageFilter(o, new fabric.filters.Sepia());
    } else {
      setVectorFilter(o as VectorWithFilters, ['sepia', 1]);
    }
  });
  if (ok) pushHistory();
}

export function applyGrayscale() {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      setImageFilter(o, new fabric.filters.Grayscale());
    } else {
      setVectorFilter(o as VectorWithFilters, ['grayscale', 1]);
    }
  });
  if (ok) pushHistory();
}

export function applyBrightness(value: number) {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      setImageFilter(o, new fabric.filters.Brightness({ brightness: value }));
    } else {
      setVectorFilter(o as VectorWithFilters, ['brightness', value]);
    }
  });
  if (ok) pushHistory();
}

export function applyContrast(value: number) {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      setImageFilter(o, new fabric.filters.Contrast({ contrast: value }));
    } else {
      setVectorFilter(o as VectorWithFilters, ['contrast', value]);
    }
  });
  if (ok) pushHistory();
}

export function applyHueRotate(degrees: number) {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      // fabric.filters.HueRotation expects rotation in radians (0..2π) or so;
      // it's a normalized 0..1 range mapped to a hue ring. Pass degrees / 360.
      setImageFilter(o, new fabric.filters.HueRotation({ rotation: degrees / 360 }));
    } else {
      setVectorFilter(o as VectorWithFilters, ['hue-rotate', degrees]);
    }
  });
  if (ok) pushHistory();
}

export function clearFilters() {
  const ok = forEachSelected((o) => {
    if (isImage(o)) {
      o.filters = [];
      o.applyFilters();
    } else {
      (o as VectorWithFilters).cssFilters = [];
    }
  });
  if (ok) pushHistory();
}
