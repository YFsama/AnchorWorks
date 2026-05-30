import type * as fabric from 'fabric';
import { useEditor, type CutPath } from '../store/editor';

export interface HistoryOptions {
  limit?: number;
}

interface Snapshot {
  /** JSON-serialised canvas state. */
  canvas: string;
  /** Cut paths at the time of the snapshot. */
  cutPaths: CutPath[];
}

export class History {
  private stack: Snapshot[] = [];
  private cursor = -1;
  private limit: number;
  private suspended = false;

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? 100;
  }

  private takeSnapshot(canvas: fabric.Canvas): Snapshot {
    return {
      canvas: JSON.stringify(canvas.toJSON()),
      // Deep-clone via JSON to detach from the live store array — otherwise
      // a later mutation that recycles the array reference would
      // silently rewrite the snapshot.
      cutPaths: JSON.parse(JSON.stringify(useEditor.getState().cutPaths)) as CutPath[],
    };
  }

  init(canvas: fabric.Canvas) {
    this.stack = [this.takeSnapshot(canvas)];
    this.cursor = 0;
  }

  capture(canvas: fabric.Canvas) {
    if (this.suspended) return;
    const snap = this.takeSnapshot(canvas);
    // Skip equal snapshots — saves stack space on quick-fire fabric events
    // that don't actually change state (e.g. mousedown→mouseup with no
    // drag). Comparing the canvas JSON is sufficient most of the time;
    // for cut-path-only changes we have to compare those too.
    const prev = this.stack[this.cursor];
    if (
      prev &&
      prev.canvas === snap.canvas &&
      JSON.stringify(prev.cutPaths) === JSON.stringify(snap.cutPaths)
    ) return;
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.cursor = this.stack.length - 1;
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  async undo(canvas: fabric.Canvas) {
    if (!this.canUndo()) return;
    this.cursor--;
    await this.restore(canvas);
  }

  async redo(canvas: fabric.Canvas) {
    if (!this.canRedo()) return;
    this.cursor++;
    await this.restore(canvas);
  }

  private async restore(canvas: fabric.Canvas) {
    this.suspended = true;
    const snap = this.stack[this.cursor];
    await canvas.loadFromJSON(JSON.parse(snap.canvas));
    canvas.renderAll();
    // Restore the cut-path slice alongside the canvas so undo of a "Place
    // RegMarks" or "Generate Contour" actually wipes the geometry the
    // user just created.
    useEditor.getState().setCutPaths(snap.cutPaths);
    this.suspended = false;
  }

  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
}
