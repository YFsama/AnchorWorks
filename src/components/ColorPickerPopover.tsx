import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

const RECENT_KEY = 'vector.recentColors';
const RECENT_LIMIT = 16;

/* ---------------- color conversions ---------------- */

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
      case gN: h = (bN - rN) / d + 2; break;
      case bN: h = (rN - gN) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sN = clamp(s, 0, 100) / 100;
  const lN = clamp(l, 0, 100) / 100;
  const hN = ((h % 360) + 360) % 360 / 360;
  if (sN === 0) {
    const v = Math.round(lN * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
  const p = 2 * lN - q;
  return {
    r: Math.round(hue2rgb(p, q, hN + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hN) * 255),
    b: Math.round(hue2rgb(p, q, hN - 1 / 3) * 255),
  };
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((c) => typeof c === 'string').slice(0, RECENT_LIMIT);
  } catch { /* ignore */ }
  return [];
}

function saveRecents(arr: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_LIMIT))); } catch { /* ignore */ }
}

/* ---------------- popover component ---------------- */

interface PopoverProps {
  value: string;
  anchor: { x: number; y: number } | null;
  onChange: (hex: string) => void;
  onClose: () => void;
}

export function ColorPickerPopover({ value, anchor, onChange, onClose }: PopoverProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => hexToRgb(value) ?? { r: 61, g: 155, b: 255 }, [value]);
  const [hex, setHex] = useState<string>(rgbToHex(initial.r, initial.g, initial.b));
  const [hsl, setHsl] = useState(() => rgbToHsl(initial.r, initial.g, initial.b));
  const [recents, setRecents] = useState<string[]>(() => loadRecents());

  // Sync external value when re-opened on a new value — track the prop during
  // render instead of inside an effect, so we don't cascade extra renders.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const rgb = hexToRgb(value);
    if (rgb) {
      const hx = rgbToHex(rgb.r, rgb.g, rgb.b);
      if (hx.toLowerCase() !== hex.toLowerCase()) {
        setHex(hx);
        setHsl(rgbToHsl(rgb.r, rgb.g, rgb.b));
      }
    }
  }

  const commitRecentAndClose = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const next = [hex, ...recents.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_LIMIT);
      setRecents(next);
      saveRecents(next);
    }
    onClose();
  };

  // click outside / escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) commitRecentAndClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') commitRecentAndClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const setFromHex = (next: string) => {
    setHex(next);
    const rgb = hexToRgb(next);
    if (rgb) {
      setHsl(rgbToHsl(rgb.r, rgb.g, rgb.b));
      onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
  };

  const setFromHsl = (h: number, s: number, l: number) => {
    const next = { h, s, l };
    setHsl(next);
    const rgb = hslToRgb(h, s, l);
    const hx = rgbToHex(rgb.r, rgb.g, rgb.b);
    setHex(hx);
    onChange(hx);
  };

  const pickRecent = (c: string) => setFromHex(c);

  // Position: prefer the anchor, but keep within viewport
  const PW = 260, PH = 320;
  const x = anchor ? clamp(anchor.x, 8, window.innerWidth - PW - 8) : 100;
  const y = anchor ? clamp(anchor.y, 8, window.innerHeight - PH - 8) : 100;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('Color picker')}
      className="fixed z-[200] bg-panel border border-border rounded-lg shadow-2xl p-3 w-[260px] text-xs"
      style={{ left: x, top: y }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-10 h-10 rounded border border-border"
          style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000' }}
        />
        <div className="flex-1">
          <label className="text-muted block mb-1">{t('HEX')}</label>
          <input
            type="text"
            spellCheck={false}
            value={hex}
            onChange={(e) => setFromHex(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)}
            aria-label={t('HEX')}
            className="input-num"
          />
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <SliderRow
          label="H"
          ariaLabel={t('Hue')}
          min={0}
          max={360}
          value={hsl.h}
          onChange={(v) => setFromHsl(v, hsl.s, hsl.l)}
          trackBg="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
        />
        <SliderRow
          label="S"
          ariaLabel={t('Saturation')}
          min={0}
          max={100}
          value={hsl.s}
          onChange={(v) => setFromHsl(hsl.h, v, hsl.l)}
          trackBg={`linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`}
        />
        <SliderRow
          label="L"
          ariaLabel={t('Lightness')}
          min={0}
          max={100}
          value={hsl.l}
          onChange={(v) => setFromHsl(hsl.h, hsl.s, v)}
          trackBg={`linear-gradient(to right, #000, hsl(${hsl.h} ${hsl.s}% 50%), #fff)`}
        />
      </div>

      <div>
        <div className="text-muted mb-1">{t('Recent')}</div>
        <div className="grid grid-cols-8 gap-1 min-h-[24px]">
          {recents.length === 0 && (
            <div className="col-span-8 text-muted text-[10px] opacity-60">{t('No recent colors yet.')}</div>
          )}
          {recents.map((c, i) => (
            <button
              key={`${c}-${i}`}
              title={c}
              aria-label={`${t('Use color')} ${c}`}
              onClick={() => pickRecent(c)}
              className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  ariaLabel,
  min,
  max,
  value,
  onChange,
  trackBg,
}: {
  label: string;
  ariaLabel?: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  trackBg: string;
}) {
  // Sighted users have the compact H / S / L chip + the gradient track for
  // context; SR users hear only the aria-label and need the full word.
  const a11y = ariaLabel ?? label;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted w-4" aria-hidden="true">{label}</span>
      <div className="flex-1 relative h-4 rounded" style={{ background: trackBg }}>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          aria-label={a11y}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-label={a11y}
        className="input-num w-14"
      />
    </div>
  );
}

