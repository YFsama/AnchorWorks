/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface ladder + foreground + brand colors are CSS-variable backed
        // so the `:root[data-theme="light"]` block in index.css can override
        // them without recompiling Tailwind. The vars hold a space-separated
        // R G B triplet and are wrapped in `rgb(... / <alpha-value>)` so
        // utilities like `text-ink/90` still work.
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        panel2: 'rgb(var(--color-panel2) / <alpha-value>)',
        panel3: 'rgb(var(--color-panel3) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        // Brand pair — kept theme-stable; reads well on both light & dark.
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        accent2: 'rgb(var(--color-accent2) / <alpha-value>)',
        // Semantic colours — used sparingly for state, never decoration.
        success: 'rgb(var(--color-success) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Six surfaces inline-declared this exact mono stack via
        // `style={{ fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace' }}`
        // — KeymapEditor key chips, MenuBar Kbd helper, CanvasContextMenu
        // Kbd helper, CommandPalette Kbd helper, Toolbar shortcut overlay,
        // HelpCenter code blocks. Promoting the stack into the Tailwind
        // `font-mono` token means `<kbd className="font-mono">` and the
        // existing `font-mono` consumers (DebugPanel log lines, AIPanel skill
        // names, ShortcutsDialog kbd pills, PlotterDialog G-code preview)
        // all share one canonical monospace family with `ui-monospace`
        // preferred and JetBrains Mono as the named fallback for terminals
        // that have it installed.
        mono: ['ui-monospace', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
};
