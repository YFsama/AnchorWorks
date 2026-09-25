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
  // Live-store `cutPaths` array reference (+ length) that produced the
  // snapshot at `cursor`. The store replaces the array immutably on every
  // update (set / spread / filter — never an in-place mutation), so an
  // unchanged reference *and* unchanged length prove the cut-path state is
  // identical to that snapshot. capture() uses this as a cheap guard to skip
  // both the JSON round-trip clone and the stringified comparison — the old
  // code paid two extra JSON.stringify passes per fabric event even when the
  // cut paths hadn't moved.
  private lastLiveCutPaths: CutPath[] | null = null;
  private lastLiveCutPathsLen = -1;

  /**
   * Seam for the capture-coalescing layer (historyOps). Invoked synchronously
   * at the top of undo() / redo(), BEFORE the cursor moves and before the
   * canUndo / canRedo checks, so a pending deferred capture (a burst of
   * pushHistory calls that hasn't drained yet) lands on the stack first.
   * Without this, "edit + immediate undo in the same tick" would advance the
   * cursor past a state that was never recorded (or no-op entirely because
   * canUndo was still false). historyOps assigns its flushPendingCapture
   * here on first contact; standalone History instances leave it null and
   * behave exactly as before.
   */
  beforeNavigate: (() => void) | null = null;

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? 100;
  }

  private takeSnapshot(canvas: fabric.Canvas, reuseCutPaths?: CutPath[]): Snapshot {
    return {
      canvas: JSON.stringify(canvas.toJSON()),
      // Deep-clone via JSON to detach from the live store array — otherwise
      // a later mutation that recycles the array reference would
      // silently rewrite the snapshot. When the caller has proven the live
      // array is unchanged (reference + length), we skip the clone entirely
      // and share the previous snapshot's immutable array instead.
      cutPaths: reuseCutPaths ?? (JSON.parse(JSON.stringify(useEditor.getState().cutPaths)) as CutPath[]),
    };
  }

  /** Record `live` as the array reference backing the snapshot at `cursor`. */
  private noteLiveCutPaths(live: CutPath[]): void {
    this.lastLiveCutPaths = live;
    this.lastLiveCutPathsLen = live.length;
  }

  init(canvas: fabric.Canvas) {
    this.stack = [this.takeSnapshot(canvas)];
    this.cursor = 0;
    this.noteLiveCutPaths(useEditor.getState().cutPaths);
  }

  capture(canvas: fabric.Canvas) {
    if (this.suspended) return;
    const live = useEditor.getState().cutPaths;
    const prev = this.stack[this.cursor];
    // Cheap guard first: same live-array reference + length as when the
    // current snapshot was accepted → cut paths are byte-for-byte unchanged,
    // no clone and no deep compare needed.
    const cutPathsUnchanged =
      !!prev &&
      this.lastLiveCutPaths === live &&
      this.lastLiveCutPathsLen === live.length;
    const snap = this.takeSnapshot(canvas, cutPathsUnchanged ? prev.cutPaths : undefined);
    // Skip equal snapshots — saves stack space on quick-fire fabric events
    // that don't actually change state (e.g. mousedown→mouseup with no
    // drag). Comparing the canvas JSON is sufficient most of the time;
    // for cut-path-only changes we have to compare those too — but only
    // when the reference guard above says the array was actually replaced.
    if (
      prev &&
      prev.canvas === snap.canvas &&
      (cutPathsUnchanged || JSON.stringify(prev.cutPaths) === JSON.stringify(snap.cutPaths))
    ) {
      // Content proven equal (string compare) — adopt the fresh reference so
      // subsequent captures can take the cheap guard path.
      this.noteLiveCutPaths(live);
      return;
    }
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.cursor = this.stack.length - 1;
    this.noteLiveCutPaths(live);
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  async undo(canvas: fabric.Canvas) {
    // Flush any pending coalesced capture BEFORE advancing the cursor — an
    // edit followed synchronously by undo must still become its own step,
    // and canUndo may only turn true once the flush lands.
    this.beforeNavigate?.();
    if (!this.canUndo()) return;
    this.cursor--;
    await this.restore(canvas);
  }

  async redo(canvas: fabric.Canvas) {
    // Same ordering as undo: a pending capture landing here represents an
    // edit, which truncates the redo stack — the subsequent canRedo check
    // then correctly refuses the redo.
    this.beforeNavigate?.();
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
    // The store now holds the snapshot's own immutable array — record the
    // reference so the next capture's cheap guard recognises it instead of
    // paying a clone + deep compare.
    this.noteLiveCutPaths(snap.cutPaths);
    this.suspended = false;
  }

  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
}
