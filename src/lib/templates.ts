/**
 * Programmatic templates used by the "New from Template…" gallery. Each
 * template builds itself on the canvas using primitive fabric shapes so we
 * don't have to ship external SVG assets.
 */

import * as fabric from 'fabric';
import { pushHistory, resizeCanvas, setBackground } from './canvasEngine';
import { useEditor } from '../store/editor';

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Inline SVG data URI used as the card thumbnail. */
  thumbnail: string;
  build: (canvas: fabric.Canvas) => Promise<void>;
}

function svgThumb(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function clearAll(canvas: fabric.Canvas) {
  canvas.discardActiveObject();
  canvas.getObjects().slice().forEach((o) => canvas.remove(o));
}

function applyDoc(width: number, height: number, background: string) {
  resizeCanvas(width, height);
  setBackground(background);
  useEditor.getState().setDoc({ width, height, background });
}

/* ----------------------------------------------------------------- */
/* 1. Business card                                                  */
/* ----------------------------------------------------------------- */

const businessCard: Template = {
  id: 'business-card',
  name: 'Business Card',
  description: '90×54 mm card with name, title and accent corner.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 204">
    <rect width="340" height="204" fill="#fff"/>
    <polygon points="240,0 340,0 340,80" fill="#3d9bff"/>
    <text x="24" y="120" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="#15151a">Jane Doe</text>
    <text x="24" y="146" font-family="Inter, sans-serif" font-size="12" fill="#5a5a64">Product Designer</text>
    <line x1="24" y1="160" x2="120" y2="160" stroke="#3d9bff" stroke-width="2"/>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(340, 204, '#ffffff');

    const accent = new fabric.Polygon(
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 80 },
      ],
      { left: 140, top: 0, fill: '#3d9bff', selectable: true },
    );
    const name = new fabric.IText('Jane Doe', {
      left: 24, top: 96, fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: '700', fill: '#15151a',
    });
    const title = new fabric.IText('Product Designer', {
      left: 24, top: 128, fontFamily: 'Inter, sans-serif', fontSize: 13, fill: '#5a5a64',
    });
    const rule = new fabric.Line([24, 152, 120, 152], { stroke: '#3d9bff', strokeWidth: 2 });
    const contact = new fabric.IText('jane@example.com  ·  +1 555 0100', {
      left: 24, top: 162, fontFamily: 'Inter, sans-serif', fontSize: 10, fill: '#5a5a64',
    });

    canvas.add(accent, name, title, rule, contact);
    canvas.requestRenderAll();
    pushHistory();
  },
};

/* ----------------------------------------------------------------- */
/* 2. Square social post                                             */
/* ----------------------------------------------------------------- */

const squareSocial: Template = {
  id: 'square-social',
  name: 'Square Social Post',
  description: '600×600 layout with bold headline and decorative shapes.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#1a1a2e"/>
    <circle cx="40" cy="160" r="38" fill="#ff7a3d"/>
    <rect x="120" y="20" width="60" height="60" rx="8" fill="#3d9bff"/>
    <text x="100" y="108" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" font-weight="800" fill="#fff">BIG IDEA</text>
    <text x="100" y="128" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="#9a9aa6">launches today</text>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(600, 600, '#1a1a2e');

    const blob = new fabric.Circle({ left: 30, top: 420, radius: 130, fill: '#ff7a3d', opacity: 0.95 });
    const square = new fabric.Rect({ left: 380, top: 60, width: 180, height: 180, rx: 24, ry: 24, fill: '#3d9bff' });
    const dot = new fabric.Circle({ left: 460, top: 320, radius: 18, fill: '#ffc83d' });

    const headline = new fabric.IText('BIG\nIDEA', {
      left: 60, top: 200, fontFamily: 'Inter, sans-serif', fontWeight: '900',
      fontSize: 160, fill: '#ffffff', lineHeight: 0.9,
    });
    const sub = new fabric.IText('launches today.', {
      left: 60, top: 520, fontFamily: 'Inter, sans-serif', fontSize: 28, fill: '#9a9aa6',
    });

    canvas.add(blob, square, dot, headline, sub);
    canvas.requestRenderAll();
    pushHistory();
  },
};

/* ----------------------------------------------------------------- */
/* 3. Logo: mountain monogram                                        */
/* ----------------------------------------------------------------- */

const mountainLogo: Template = {
  id: 'mountain-logo',
  name: 'Mountain Logo',
  description: 'Two-tone mountain monogram, centered.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#0f0f12"/>
    <polygon points="60,140 100,70 140,140" fill="#3d9bff"/>
    <polygon points="100,70 130,110 100,140 80,110" fill="#ff7a3d"/>
    <text x="100" y="170" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#fff">ALPINE</text>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(500, 500, '#0f0f12');

    const cx = 250, baseY = 320, peakY = 130;
    const back = new fabric.Polygon(
      [
        { x: cx - 130, y: baseY },
        { x: cx, y: peakY },
        { x: cx + 130, y: baseY },
      ],
      { left: cx - 130, top: peakY, fill: '#3d9bff' },
    );
    const front = new fabric.Polygon(
      [
        { x: cx, y: peakY },
        { x: cx + 60, y: 220 },
        { x: cx, y: baseY },
        { x: cx - 60, y: 220 },
      ],
      { left: cx - 60, top: peakY, fill: '#ff7a3d' },
    );
    const wordmark = new fabric.IText('ALPINE', {
      left: cx, top: 360, originX: 'center',
      fontFamily: 'Inter, sans-serif', fontSize: 44, fontWeight: '800', fill: '#ffffff',
      charSpacing: 800,
    });

    canvas.add(back, front, wordmark);
    canvas.requestRenderAll();
    pushHistory();
  },
};

/* ----------------------------------------------------------------- */
/* 4. Poster A4                                                      */
/* ----------------------------------------------------------------- */

const posterA4: Template = {
  id: 'poster-a4',
  name: 'Poster A4',
  description: 'A4 poster with big headline, subhead and accent block.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280">
    <rect width="200" height="280" fill="#fff"/>
    <rect x="0" y="0" width="200" height="60" fill="#15151a"/>
    <text x="20" y="38" font-family="Inter, sans-serif" font-size="14" font-weight="800" fill="#fff">EVENT</text>
    <text x="20" y="140" font-family="Inter, sans-serif" font-size="28" font-weight="900" fill="#15151a">SUMMER</text>
    <text x="20" y="172" font-family="Inter, sans-serif" font-size="28" font-weight="900" fill="#15151a">FEST</text>
    <rect x="20" y="200" width="60" height="40" fill="#ff7a3d"/>
    <text x="20" y="262" font-family="Inter, sans-serif" font-size="10" fill="#5a5a64">Aug 24 · Brooklyn</text>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(794, 1123, '#ffffff');

    const header = new fabric.Rect({ left: 0, top: 0, width: 794, height: 180, fill: '#15151a' });
    const eyebrow = new fabric.IText('EVENT · 2026', {
      left: 60, top: 90, fontFamily: 'Inter, sans-serif', fontSize: 28, fontWeight: '800', fill: '#ffffff', charSpacing: 200,
    });
    const headline1 = new fabric.IText('SUMMER', {
      left: 60, top: 330, fontFamily: 'Inter, sans-serif', fontSize: 168, fontWeight: '900', fill: '#15151a', lineHeight: 0.9,
    });
    const headline2 = new fabric.IText('FEST', {
      left: 60, top: 490, fontFamily: 'Inter, sans-serif', fontSize: 168, fontWeight: '900', fill: '#15151a', lineHeight: 0.9,
    });
    const accent = new fabric.Rect({ left: 60, top: 700, width: 280, height: 160, fill: '#ff7a3d' });
    const sub = new fabric.IText('A weekend of music, art and food.', {
      left: 60, top: 900, fontFamily: 'Inter, sans-serif', fontSize: 36, fill: '#15151a',
    });
    const footer = new fabric.IText('Aug 24 · Brooklyn, NY · alpine.fest', {
      left: 60, top: 1040, fontFamily: 'Inter, sans-serif', fontSize: 22, fill: '#5a5a64',
    });

    canvas.add(header, eyebrow, headline1, headline2, accent, sub, footer);
    canvas.requestRenderAll();
    pushHistory();
  },
};

/* ----------------------------------------------------------------- */
/* 5. Sticker pack                                                   */
/* ----------------------------------------------------------------- */

const stickerPack: Template = {
  id: 'sticker-pack',
  name: 'Sticker Pack',
  description: 'A grid of six colorful sticker discs with emoji labels.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#fff"/>
    <circle cx="50" cy="50" r="34" fill="#ff7a3d"/>
    <circle cx="120" cy="50" r="34" fill="#3d9bff"/>
    <circle cx="190" cy="50" r="34" fill="#ffc83d"/>
    <circle cx="50" cy="115" r="34" fill="#7a3dff"/>
    <circle cx="120" cy="115" r="34" fill="#3dffd0"/>
    <circle cx="190" cy="115" r="34" fill="#ff3d7a"/>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(720, 480, '#ffffff');

    const items = [
      { color: '#ff7a3d', emoji: '🔥' },
      { color: '#3d9bff', emoji: '🌊' },
      { color: '#ffc83d', emoji: '⭐' },
      { color: '#7a3dff', emoji: '🚀' },
      { color: '#3dffd0', emoji: '🌱' },
      { color: '#ff3d7a', emoji: '💖' },
    ];
    const radius = 90;
    const gap = 40;
    const cols = 3;
    const startX = 80;
    const startY = 80;

    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (radius * 2 + gap);
      const cy = startY + row * (radius * 2 + gap);
      const circle = new fabric.Circle({
        left: cx, top: cy, radius, fill: item.color,
        stroke: '#ffffff', strokeWidth: 6,
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.18)', blur: 12, offsetX: 0, offsetY: 6 }),
      });
      const label = new fabric.IText(item.emoji, {
        left: cx + radius, top: cy + radius, originX: 'center', originY: 'center',
        fontFamily: 'Inter, sans-serif', fontSize: 72, fill: '#ffffff',
      });
      canvas.add(circle, label);
    });
    canvas.requestRenderAll();
    pushHistory();
  },
};

/* ----------------------------------------------------------------- */
/* 6. Flyer                                                          */
/* ----------------------------------------------------------------- */

const flyer: Template = {
  id: 'flyer',
  name: 'Flyer',
  description: 'Header strip, body block and footer info on letter-ish size.',
  thumbnail: svgThumb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
    <rect width="200" height="260" fill="#fff"/>
    <rect x="0" y="0" width="200" height="44" fill="#3d9bff"/>
    <text x="14" y="28" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#fff">Workshop</text>
    <rect x="14" y="72" width="172" height="120" fill="#f1f1f4" rx="6"/>
    <text x="100" y="138" text-anchor="middle" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#15151a">Learn Vector</text>
    <text x="100" y="158" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" fill="#5a5a64">in one afternoon</text>
    <rect x="0" y="220" width="200" height="40" fill="#15151a"/>
    <text x="14" y="246" font-family="Inter, sans-serif" font-size="10" fill="#fff">Sat · 14:00 · Studio B</text>
  </svg>`),
  async build(canvas) {
    clearAll(canvas);
    applyDoc(612, 792, '#ffffff');

    const headerBg = new fabric.Rect({ left: 0, top: 0, width: 612, height: 110, fill: '#3d9bff' });
    const headerText = new fabric.IText('Workshop · 2026', {
      left: 40, top: 38, fontFamily: 'Inter, sans-serif', fontSize: 34, fontWeight: '700', fill: '#ffffff',
    });

    const bodyBg = new fabric.Rect({
      left: 40, top: 160, width: 532, height: 420, fill: '#f1f1f4', rx: 18, ry: 18,
    });
    const bodyHeadline = new fabric.IText('Learn Vector', {
      left: 306, top: 300, originX: 'center',
      fontFamily: 'Inter, sans-serif', fontSize: 56, fontWeight: '800', fill: '#15151a',
    });
    const bodySub = new fabric.IText('in one afternoon', {
      left: 306, top: 372, originX: 'center',
      fontFamily: 'Inter, sans-serif', fontSize: 26, fill: '#5a5a64',
    });
    const bullets = new fabric.IText(
      '• Tools & shortcuts\n• Color systems\n• Export pipelines',
      {
        left: 90, top: 440, fontFamily: 'Inter, sans-serif', fontSize: 20, fill: '#15151a', lineHeight: 1.45,
      },
    );

    const footerBg = new fabric.Rect({ left: 0, top: 700, width: 612, height: 92, fill: '#15151a' });
    const footerText = new fabric.IText('Sat · 14:00 · Studio B · alpine.studio', {
      left: 40, top: 730, fontFamily: 'Inter, sans-serif', fontSize: 22, fill: '#ffffff',
    });

    canvas.add(headerBg, headerText, bodyBg, bodyHeadline, bodySub, bullets, footerBg, footerText);
    canvas.requestRenderAll();
    pushHistory();
  },
};

export const TEMPLATES: Template[] = [
  businessCard,
  squareSocial,
  mountainLogo,
  posterA4,
  stickerPack,
  flyer,
];
