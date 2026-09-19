/**
 * Vitest setup — storage shim for Node's inert experimental `localStorage`.
 *
 * Node >= 22 pre-defines `globalThis.localStorage` as part of its experimental
 * webstorage; without `--localstorage-file` it evaluates to `undefined` (with a
 * warning). Because the key already exists on globalThis, the jsdom test
 * environment leaves it alone instead of installing jsdom's own Storage, so
 * every storage-backed module test sees `localStorage === undefined` and dies
 * on `localStorage.clear()`.
 *
 * Redefining it with a small in-memory Storage restores the contract those
 * tests rely on. Runs before any test file (setupFiles), after the jsdom
 * environment exists, so it only fills the gap — it never replaces a working
 * implementation.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

const ls = (globalThis as { localStorage?: Storage }).localStorage;
if (typeof ls === 'undefined' || ls === null) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
