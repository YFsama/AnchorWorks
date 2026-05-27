import type * as fabric from 'fabric';

export interface HistoryOptions {
  limit?: number;
}

export class History {
  private stack: string[] = [];
  private cursor = -1;
  private limit: number;
  private suspended = false;

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? 100;
  }

  init(canvas: fabric.Canvas) {
    this.stack = [JSON.stringify(canvas.toJSON())];
    this.cursor = 0;
  }

  capture(canvas: fabric.Canvas) {
    if (this.suspended) return;
    const snap = JSON.stringify(canvas.toJSON());
    if (snap === this.stack[this.cursor]) return;
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
    const data = JSON.parse(this.stack[this.cursor]);
    await canvas.loadFromJSON(data);
    canvas.renderAll();
    this.suspended = false;
  }

  suspend() { this.suspended = true; }
  resume() { this.suspended = false; }
}
