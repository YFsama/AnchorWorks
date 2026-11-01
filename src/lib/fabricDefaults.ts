/**
 * fabric v7 compat — restore v6 origin semantics.
 *
 * fabric 7 (PR #10715) deprecated `originX`/`originY` and flipped their
 * defaults from `'left'/'top'` to `'center'/'center'`. Every positioning
 * path in this app (tool placement, outline/cut-path geometry, SVG/PDF
 * import, saved-project deserialization) was written against the v6
 * meaning of `left`/`top` — under the new default each object would sit
 * half-width/half-height off from where the code intends.
 *
 * Assigning the class-level defaults restores the v6 meaning for every
 * shape type (subclasses inherit `FabricObject.ownDefaults` unless they
 * override origin themselves) and for `loadFromJSON` of v6-era project
 * files whose serialized objects rely on the then-default origin.
 *
 * Remove this only alongside a deliberate migration to center origins.
 */
import { FabricObject } from 'fabric';

FabricObject.ownDefaults.originX = 'left';
FabricObject.ownDefaults.originY = 'top';
