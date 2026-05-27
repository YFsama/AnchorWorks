/** Built-in + Google font registry. Lazily injects @import links into the page. */

export interface FontDef { name: string; family: string; google?: boolean; weights?: number[]; }

export const SYSTEM_FONTS: FontDef[] = [
  { name: 'Inter', family: 'Inter, system-ui, sans-serif' },
  { name: 'System UI', family: 'system-ui, sans-serif' },
  { name: 'Sans', family: 'Arial, Helvetica, sans-serif' },
  { name: 'Serif', family: 'Georgia, Times, serif' },
  { name: 'Mono', family: 'ui-monospace, Menlo, monospace' },
];

export const GOOGLE_FONTS: FontDef[] = [
  { name: 'Roboto', family: 'Roboto, sans-serif', google: true, weights: [300, 400, 500, 700] },
  { name: 'Open Sans', family: 'Open Sans, sans-serif', google: true, weights: [400, 600, 700] },
  { name: 'Lato', family: 'Lato, sans-serif', google: true, weights: [400, 700] },
  { name: 'Montserrat', family: 'Montserrat, sans-serif', google: true, weights: [400, 600, 700] },
  { name: 'Poppins', family: 'Poppins, sans-serif', google: true, weights: [400, 500, 700] },
  { name: 'Playfair Display', family: 'Playfair Display, serif', google: true, weights: [400, 700] },
  { name: 'Merriweather', family: 'Merriweather, serif', google: true, weights: [400, 700] },
  { name: 'Bebas Neue', family: 'Bebas Neue, sans-serif', google: true, weights: [400] },
  { name: 'Pacifico', family: 'Pacifico, cursive', google: true, weights: [400] },
  { name: 'Dancing Script', family: 'Dancing Script, cursive', google: true, weights: [400, 700] },
  { name: 'Fira Code', family: 'Fira Code, monospace', google: true, weights: [400, 600] },
  { name: 'JetBrains Mono', family: 'JetBrains Mono, monospace', google: true, weights: [400, 700] },
  { name: 'Noto Sans SC', family: 'Noto Sans SC, sans-serif', google: true, weights: [400, 700] },
  { name: 'Noto Serif SC', family: 'Noto Serif SC, serif', google: true, weights: [400, 700] },
  { name: 'ZCOOL XiaoWei', family: 'ZCOOL XiaoWei, serif', google: true, weights: [400] },
  { name: 'Ma Shan Zheng', family: 'Ma Shan Zheng, cursive', google: true, weights: [400] },
];

export const ALL_FONTS: FontDef[] = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

const loaded = new Set<string>();
export function ensureFontLoaded(name: string) {
  if (loaded.has(name)) return;
  const def = ALL_FONTS.find(f => f.name === name);
  if (!def || !def.google) { loaded.add(name); return; }
  const wt = def.weights?.join(';') ?? '400';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(def.name).replace(/%20/g, '+')}:wght@${wt}&display=swap`;
  document.head.appendChild(link);
  loaded.add(name);
}

/** Custom user-uploaded fonts (woff/woff2/ttf). */
export async function loadCustomFontFile(file: File): Promise<FontDef> {
  const buf = await file.arrayBuffer();
  const family = file.name.replace(/\.(woff2?|ttf|otf)$/i, '');
  const fontFace = new FontFace(family, buf);
  await fontFace.load();
  document.fonts.add(fontFace);
  const def: FontDef = { name: family, family };
  SYSTEM_FONTS.push(def);
  loaded.add(family);
  return def;
}
