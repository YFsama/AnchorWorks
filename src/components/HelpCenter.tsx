import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Search, Sparkles, Compass, MousePointer2, PenTool, Layers as LayersIcon,
  Palette, Type, Wand2, Image as ImageIcon, FileText, Send, Printer, Save,
  Keyboard, Accessibility, BookOpen, Settings, Eye, Cloud,
  type LucideIcon,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Help Center
 * ---------------------------------------------------------------
 * The in-app reference for every visible feature in Anchorworks.
 * Opens via Help menu → Help Center…, the Command Palette, or F1.
 *
 * Structure: left rail = category-grouped topic list with a fuzzy
 * search input. Right pane = a long-form body for the selected
 * topic with inline <kbd> chips for shortcut references.
 *
 * Topics are deliberately co-located in this file as plain React
 * fragments — they're prose, not data, and embedding the markup
 * lets us mix <kbd>, <strong>, and <ul> naturally without a
 * markdown renderer dependency.
 */

interface Topic {
  id: string;
  category: string;
  title: string;
  /** Plain-text keywords that the fuzzy search also scans. */
  keywords?: string;
  body: () => React.ReactNode;
}

/**
 * A keyboard chip — mirrors the look of the Kbd component in
 * MenuBar / CommandPalette but renders a single key fragment so
 * topic bodies can drop them inline.
 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 rounded bg-panel3 border border-border text-[10px] font-medium font-mono text-ink leading-none tabular-nums align-middle"
    >
      {children}
    </kbd>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink/90 leading-relaxed">{children}</p>;
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="field-label text-[11px] font-semibold mt-5 mb-2">
      {children}
    </h4>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-ink/85 leading-relaxed">
      {children}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 px-3 py-2 rounded bg-panel2 border border-border text-xs text-muted leading-relaxed">
      {children}
    </div>
  );
}

/**
 * Build the topic list. Category labels are translated via the
 * provided `t` so the rail follows the user's language; the body
 * prose stays in English (translation is out of scope for the
 * help text itself).
 */
function buildTopics(t: (k: string) => string): Topic[] {
  return [
    // ------------- Getting started -------------
    {
      id: 'welcome',
      category: t('Getting started'),
      title: t('Welcome'),
      keywords: 'intro overview start',
      body: () => (
        <>
          <P>
            Anchorworks is a browser-native vector editor for designers, illustrators,
            and makers. It pairs a Fabric.js canvas with an AI assistant that can see what
            you're drawing and help shape it — laying out icons, recolouring palettes,
            running boolean operations, or producing G-code for a pen plotter sitting on
            your desk. Everything happens locally in the browser: your work stays in your
            tab unless you explicitly export or send it.
          </P>
          <H>What's in the box</H>
          <UL>
            <li>A modern shape, pen, pencil and text toolset with snap, smart guides and rulers</li>
            <li>Boolean path operations, compound paths, anchor editing and clipping masks</li>
            <li>Gradients, shadows, SVG filters, pattern fills and a quick contrast checker</li>
            <li>Layers, artboards, symbols and a built-in asset library</li>
            <li>Import / export for SVG, PNG, JPG, PDF (vector or raster), DXF and JSON</li>
            <li>Direct output to pen plotters and cutters via G-code, HP-GL and Web Serial</li>
            <li>An AI assistant with vision, custom skills, and optional MCP servers</li>
          </UL>
          <H>Where to go next</H>
          <P>
            Read <strong>Workspace tour</strong> if you've never used a vector editor like this
            before — it walks you through the menu bar, the left toolbar, the right inspector
            stack, and the canvas itself. Then jump to <strong>First drawing</strong> for a
            five-minute hands-on. The rest of this Help Center is organised topic-by-topic
            so you can dip in when you need a specific feature.
          </P>
          <Note>
            You can reopen this Help Center at any time with <Kbd>F1</Kbd>, from the
            <strong> Help</strong> menu, or via the Command Palette (<Kbd>Ctrl</Kbd><Kbd>K</Kbd>).
          </Note>
        </>
      ),
    },
    {
      id: 'workspace',
      category: t('Getting started'),
      title: t('Workspace tour'),
      keywords: 'ui layout panels menu',
      body: () => (
        <>
          <P>
            The workspace has four regions. Across the top is the <strong>menu bar</strong>:
            File, Edit, View, Document and Help drop-downs on the left, then your
            grid / snap / guides / <strong>anchor</strong> cluster (the segmented control
            with the four toggles), and on the right the save indicator, zoom readout,
            Plotter / Print / Export / AI buttons and the language switcher. The fourth
            toggle — Anchor — turns on anchor snap, which snaps a drag to neighbouring
            objects' corners, edge midpoints, and path anchors.
          </P>
          <P>
            Down the left edge sits the <strong>toolbar</strong>. Each tool has a single-letter
            shortcut shown in its tooltip — <Kbd>V</Kbd> for Select, <Kbd>R</Kbd> for
            Rectangle, <Kbd>P</Kbd> for Pen, and so on. Tools that have variants (the
            shape group, for example) reveal additional options on the right when active.
          </P>
          <P>
            The <strong>canvas</strong> dominates the middle. Rulers run along the top and left;
            a status bar runs along the bottom showing cursor position, zoom level,
            active tool, and the grid / snap / guides state. Drop SVGs, PNGs or JPEGs
            anywhere on the canvas to import them.
          </P>
          <P>
            The right-hand <strong>inspector stack</strong> holds every contextual panel:
            Properties, Align &amp; Distribute, Artboards, Symbols, Layers,
            <strong> Inspect</strong>, and Assets. Each is collapsible — only what you
            need stays expanded. The <em>Inspect</em> panel (new since Wave 9) reports
            live document stats: object counts by type, total path length, area, an
            estimated SVG size, the union bounding box, and the dominant palette.
            On a narrow screen (under 900 px wide) the inspector slides off and a
            floating <em>Tools</em> button surfaces it as a sheet.
          </P>
          <H>Modal surfaces</H>
          <P>
            Dialogs like Document Settings, Print, Plotter, Templates, Shortcuts and
            this Help Center open above the canvas at <Kbd>z-50</Kbd> with a dim
            backdrop. Press <Kbd>Esc</Kbd> to close them — except when you have a
            canvas selection, in which case <Kbd>Esc</Kbd> deselects first.
          </P>
        </>
      ),
    },
    {
      id: 'first-drawing',
      category: t('Getting started'),
      title: t('First drawing'),
      keywords: 'tutorial hello',
      body: () => (
        <>
          <P>
            Let's make something in five minutes. Press <Kbd>R</Kbd> to grab the rectangle
            tool, then drag on the canvas to draw a box. Hold <Kbd>Shift</Kbd> while
            dragging to constrain to a square. Release, then press <Kbd>V</Kbd> to switch
            back to Select.
          </P>
          <P>
            Click the box. The Properties panel on the right lights up with its fill,
            stroke, opacity, transform fields and arrange buttons. Click the fill swatch
            to open the color picker; pick something bright. Notice the stroke can be set
            independently — and there's an Advanced color picker if you need precise HSL,
            HEX or eyedropper picks.
          </P>
          <P>
            Press <Kbd>E</Kbd> for the ellipse tool and draw a circle that overlaps the
            box. Select both (drag a marquee, or click one and Shift-click the other),
            then open <strong>Align &amp; Distribute</strong> in the right rail and hit
            <em> Pathfinder → Union</em>. The two shapes merge into one path.
          </P>
          <P>
            Try a quick polish: open the <strong>Drop shadow</strong> section in the
            Properties panel, enable it, and dial in 8 px blur with a 4 px offset.
            Then press <Kbd>Ctrl</Kbd><Kbd>S</Kbd> to export the result as an SVG.
          </P>
          <P>
            That's the loop — pick a tool, draw, refine in the inspector, combine and
            export. The rest of this Help Center fills in the details.
          </P>
        </>
      ),
    },

    // ------------- Tools -------------
    {
      id: 'tool-select',
      category: t('Tools'),
      title: t('Select tool'),
      keywords: 'pointer arrow move resize',
      body: () => (
        <>
          <P>
            The <strong>Select</strong> tool (<Kbd>V</Kbd>) is your default pointer.
            Click any object to select it, or drag an empty area of the canvas to
            marquee-select multiple objects. Shift-click toggles individual objects
            into and out of the selection.
          </P>
          <H>Moving and resizing</H>
          <P>
            Drag a selected object to move it. The corner and edge handles resize;
            hold <Kbd>Shift</Kbd> on a corner handle to preserve aspect ratio. The
            rotation handle sits just above the top-center handle — drag it to rotate,
            holding <Kbd>Shift</Kbd> to snap to 15° increments. Arrow keys nudge by
            1 px; <Kbd>Shift</Kbd>+arrow nudges by 10 px.
          </P>
          <H>Marquee &amp; multi-select</H>
          <P>
            A drag that starts in empty space draws a marquee. When you have two or
            more objects selected, the Align &amp; Distribute panel becomes active and
            the Pathfinder buttons (Union, Subtract, Intersect, Exclude) light up.
          </P>
          <H>Context menu</H>
          <P>
            Right-click any object to bring up the canvas context menu — quick access
            to Cut / Copy / Paste, Duplicate, Bring Forward / Send Backward, Group /
            Ungroup, and Delete. The same actions are reachable from the keyboard
            (<Kbd>Ctrl</Kbd><Kbd>C</Kbd>, <Kbd>Ctrl</Kbd><Kbd>D</Kbd>, <Kbd>Delete</Kbd>).
          </P>
        </>
      ),
    },
    {
      id: 'tool-shapes',
      category: t('Tools'),
      title: t('Shape tools'),
      keywords: 'rectangle ellipse line polygon star',
      body: () => (
        <>
          <P>
            Anchorworks ships four primitive shape tools:
            <strong> Rectangle</strong> (<Kbd>R</Kbd>),
            <strong> Ellipse</strong> (<Kbd>E</Kbd>),
            <strong> Line</strong> (<Kbd>L</Kbd>), and
            <strong> Polygon</strong> (<Kbd>G</Kbd>).
            Each works the same way — pick the tool, drag from one corner of the
            shape's bounding box to the opposite corner, then release.
          </P>
          <H>Modifiers</H>
          <UL>
            <li><Kbd>Shift</Kbd> while dragging — constrain to a square / circle / 45° line</li>
            <li><Kbd>Alt</Kbd> while dragging — draw from center outwards</li>
            <li>For Polygon, drag radius then release; sides default to 6 and can be edited in Properties afterwards</li>
          </UL>
          <H>After the draw</H>
          <P>
            The current fill and stroke (set in the Properties panel before drawing)
            are applied automatically. Switch to the Select tool (<Kbd>V</Kbd>) to fine-tune
            position, size, fill, stroke width, opacity, blend mode, drop shadow, and
            corner rounding (for rectangles).
          </P>
          <H>Converting to a path</H>
          <P>
            Run a boolean op (Pathfinder → Union with itself, for example) or pick
            <em> Convert to Path </em>from the context menu to turn a primitive into an
            editable path. After that, the <strong>Anchor edit</strong> mode unlocks
            full bezier control over every node.
          </P>
        </>
      ),
    },
    {
      id: 'tool-pen',
      category: t('Tools'),
      title: t('Pen tool'),
      keywords: 'bezier path nodes anchors',
      body: () => (
        <>
          <P>
            The <strong>Pen</strong> (<Kbd>P</Kbd>) is the precise way to build paths.
            Click to place a corner anchor; click-and-drag to place a smooth anchor
            with bezier handles. The handles set the slope of the curve into and out
            of that anchor.
          </P>
          <H>Workflow</H>
          <UL>
            <li>Click once to start the path</li>
            <li>Click successive points; drag to curve through them</li>
            <li>Click the original anchor to close the path</li>
            <li>Press <Kbd>Enter</Kbd> or switch tools to finish an open path</li>
            <li>Press <Kbd>Esc</Kbd> to discard the current path mid-draw</li>
          </UL>
          <H>Hold modifiers</H>
          <P>
            <Kbd>Shift</Kbd> snaps the new segment to 45° angles. <Kbd>Alt</Kbd> on an
            existing handle breaks the smooth tangent so the in-handle and out-handle
            can move independently.
          </P>
          <Note>
            Once a pen path exists, switch to <strong>Anchor edit</strong> (in the
            Properties panel of the selected path) to move individual nodes, drag
            their handles, insert new anchors on a segment, or delete anchors. This
            is the same surface used for shapes converted to paths.
          </Note>
        </>
      ),
    },
    {
      id: 'tool-pencil',
      category: t('Tools'),
      title: t('Pencil tool'),
      keywords: 'freehand brush draw',
      body: () => (
        <>
          <P>
            The <strong>Pencil</strong> (<Kbd>B</Kbd>) is a freehand drawing tool that
            samples your pointer's position and emits a smoothed path. It's great for
            sketching, hand-lettering, signatures, or stroking on top of a traced
            image.
          </P>
          <H>Pressure sensitivity</H>
          <P>
            On a pressure-aware stylus (Apple Pencil, Wacom, Surface Pen) the
            pencil widens and tapers based on stylus pressure — see
            <em> Pressure brush </em>under Drawing &amp; paths. The current fill
            color is used as the stroke color; stroke width is set by your
            Properties panel before you start drawing.
          </P>
          <H>Smoothing</H>
          <P>
            Anchorworks applies adaptive smoothing as you draw, so a shaky line
            still produces a clean bezier path with a reasonable anchor count. After
            you release, switch to <strong>Anchor edit</strong> if you want to clean
            up individual nodes by hand.
          </P>
        </>
      ),
    },
    {
      id: 'tool-eraser',
      category: t('Tools'),
      title: t('Eraser tool'),
      keywords: 'remove rub delete',
      body: () => (
        <>
          <P>
            The <strong>Eraser</strong> (<Kbd>X</Kbd>) removes whatever you drag over.
            Unlike a destructive raster eraser, it works at the object level: paths,
            shapes, and groups touching the eraser's brush are deleted in one
            operation, then pushed to history so <Kbd>Ctrl</Kbd><Kbd>Z</Kbd> brings
            them back.
          </P>
          <H>Brush size</H>
          <P>
            Use <Kbd>+</Kbd> and <Kbd>-</Kbd> while the eraser is active to grow or
            shrink the brush. The current size is shown in the eraser HUD that floats
            near the cursor. The AI can also set it via the <code>set_eraser_size</code>
            skill, e.g. "set my eraser to 40 px".
          </P>
          <Note>
            The eraser is non-destructive in the sense that it never modifies path
            geometry — it removes whole objects. For sub-object erasing, convert your
            shape to a path, then use <strong>Subtract</strong> from the Pathfinder.
          </Note>
        </>
      ),
    },
    {
      id: 'tool-text',
      category: t('Tools'),
      title: t('Text tool'),
      keywords: 'type font label heading',
      body: () => (
        <>
          <P>
            The <strong>Text</strong> tool (<Kbd>T</Kbd>) drops a text object at the
            click point. Double-click any text object to enter edit mode and retype.
            Press <Kbd>Esc</Kbd> or click elsewhere to commit.
          </P>
          <H>Styling text</H>
          <P>
            With a text object selected, the Properties panel reveals a <strong>Font</strong>
            section: family, weight, size, line height, alignment, and letter spacing.
            See <em>Fonts &amp; uploads</em> and the <em>Character panel</em> topic
            for the full set.
          </P>
          <H>Text on a path</H>
          <P>
            Select a text object and a path together, then look for the
            <em> Text on path </em>option in Properties. The text flows along the path's
            stroke direction. Edit the path afterwards and the text re-flows.
          </P>
        </>
      ),
    },
    {
      id: 'tool-hand',
      category: t('Tools'),
      title: t('Hand tool'),
      keywords: 'pan move viewport',
      body: () => (
        <>
          <P>
            The <strong>Hand</strong> tool (<Kbd>H</Kbd>) pans the canvas. More usefully,
            hold <Kbd>Space</Kbd> from any other tool to temporarily switch to Hand —
            release to snap back to your prior tool. This is the Photoshop / Illustrator
            / Figma convention.
          </P>
          <P>
            On laptop trackpads, a two-finger drag also pans regardless of the active
            tool. On touch devices, a one-finger drag (when starting in empty canvas)
            pans; pinch zooms.
          </P>
        </>
      ),
    },
    {
      id: 'tool-zoom',
      category: t('Tools'),
      title: t('Zoom tool'),
      keywords: 'magnify scale view',
      body: () => (
        <>
          <P>
            The <strong>Zoom</strong> tool (<Kbd>Z</Kbd>) magnifies on click — hold
            <Kbd>Alt</Kbd> to zoom out instead. Drag a marquee to zoom to a specific
            region. The menu bar's zoom readout is also clickable and triggers
            <em> Fit to page </em>(<Kbd>Ctrl</Kbd><Kbd>0</Kbd>).
          </P>
          <H>Keyboard shortcuts (work from any tool)</H>
          <UL>
            <li><Kbd>Ctrl</Kbd><Kbd>=</Kbd> — zoom in</li>
            <li><Kbd>Ctrl</Kbd><Kbd>-</Kbd> — zoom out</li>
            <li><Kbd>Ctrl</Kbd><Kbd>0</Kbd> — fit page to viewport</li>
          </UL>
          <P>
            Mouse-wheel scrolling zooms by default; hold <Kbd>Shift</Kbd> to scroll
            horizontally instead. Pinch on a trackpad always zooms.
          </P>
        </>
      ),
    },

    // ------------- Drawing & paths -------------
    {
      id: 'bezier',
      category: t('Drawing & paths'),
      title: t('Bezier handles'),
      keywords: 'curves smooth tangent control',
      body: () => (
        <>
          <P>
            Every smooth anchor on a path has two <strong>bezier handles</strong> — one
            governing how the curve arrives, one governing how it leaves. Anchorworks
            shows them as a pair of round handles tethered to the anchor by a guide line.
          </P>
          <H>Editing</H>
          <P>
            Enter <strong>Anchor edit</strong> mode on a path. Drag a handle to change the
            curve's slope and depth. By default the two handles of a smooth anchor are
            mirrored (a true tangent). Hold <Kbd>Alt</Kbd> while dragging to break the
            mirror — you can then move each handle independently, producing a corner
            with curved approach and departure on either side.
          </P>
          <H>Corner vs. smooth</H>
          <P>
            Click an anchor to toggle between corner and smooth. A corner anchor has
            no handles (or zero-length handles); a smooth anchor has paired handles.
            Toggling preserves the path's overall shape as best it can.
          </P>
          <Note>
            Handles only show when the path is in anchor-edit mode. If you don't see
            them, double-click the path or click <em>Edit anchors</em> in the
            Properties panel.
          </Note>
        </>
      ),
    },
    {
      id: 'anchor-edit',
      category: t('Drawing & paths'),
      title: t('Anchor edit'),
      keywords: 'nodes path editing',
      body: () => (
        <>
          <P>
            <strong>Anchor edit</strong> is how you reshape an existing path node-by-node.
            Select any path or converted shape, then click <em>Edit anchors</em> in the
            Properties panel (or double-click the path).
          </P>
          <H>Operations</H>
          <UL>
            <li>Click an anchor to select it; Shift-click to add to selection</li>
            <li>Drag selected anchors to move them</li>
            <li>Click on an empty segment to insert a new anchor at that point</li>
            <li>Select an anchor and press <Kbd>Delete</Kbd> to remove it (the path re-curves around the gap)</li>
            <li>Drag the handles to change curvature; <Kbd>Alt</Kbd>-drag to break the tangent</li>
          </UL>
          <H>Exiting</H>
          <P>
            Press <Kbd>Esc</Kbd>, switch tools, or click outside the path to leave anchor
            mode. Every change is pushed to history as a single step.
          </P>
        </>
      ),
    },
    {
      id: 'boolean',
      category: t('Drawing & paths'),
      title: t('Boolean operations'),
      keywords: 'union subtract intersect exclude pathfinder',
      body: () => (
        <>
          <P>
            The <strong>Pathfinder</strong> section in the Align &amp; Distribute panel
            offers four boolean operations on two or more selected paths:
          </P>
          <UL>
            <li><strong>Union</strong> — merge into a single outline (the silhouette of the combined shapes)</li>
            <li><strong>Subtract</strong> — remove the top shape from the bottom</li>
            <li><strong>Intersect</strong> — keep only the overlapping area</li>
            <li><strong>Exclude</strong> — keep everything except the overlapping area</li>
          </UL>
          <H>Stacking order matters</H>
          <P>
            <strong>Subtract</strong> uses the top object as the "cutter" and the bottom
            as the "base". Use <em>Bring Forward</em> / <em>Send Backward</em> (or
            <Kbd>Ctrl</Kbd><Kbd>]</Kbd> / <Kbd>Ctrl</Kbd><Kbd>[</Kbd>) to fix the order
            before running the op.
          </P>
          <H>What you get back</H>
          <P>
            All four operations return a single new path that inherits the bottom-most
            object's fill and stroke. The originals are removed. Undo
            (<Kbd>Ctrl</Kbd><Kbd>Z</Kbd>) restores them.
          </P>
          <Note>
            Booleans only work on closed paths. If the op silently does nothing,
            check that both inputs are paths (not text or images), and that they
            actually overlap.
          </Note>
        </>
      ),
    },
    {
      id: 'compound',
      category: t('Drawing & paths'),
      title: t('Compound paths'),
      keywords: 'holes subpath donut',
      body: () => (
        <>
          <P>
            A <strong>compound path</strong> is one path made of multiple sub-paths,
            most often used to punch holes — think of the letter "O" or a donut shape.
            Inner sub-paths run counter-clockwise relative to the outer's clockwise
            direction, and the renderer treats them as voids.
          </P>
          <H>Making one</H>
          <P>
            Select two stacked closed paths and run <strong>Subtract</strong> from the
            Pathfinder. The result is a compound path that retains the cut-out as a
            true hole rather than a fill on top.
          </P>
          <H>Editing</H>
          <P>
            Enter <strong>Anchor edit</strong> on the compound — every sub-path's nodes
            are visible together. You can reshape any of them; the hole topology stays
            valid as long as you don't make sub-paths cross.
          </P>
        </>
      ),
    },
    {
      id: 'clip',
      category: t('Drawing & paths'),
      title: t('Clip masks'),
      keywords: 'mask crop hide',
      body: () => (
        <>
          <P>
            A <strong>clip mask</strong> hides the parts of an object that fall outside a
            mask shape. Anchorworks supports clip-paths on any object, including
            imported images.
          </P>
          <H>Applying</H>
          <P>
            Select the object you want to clip and the shape you want to use as a mask
            (the mask shape on top). From the right-click context menu choose
            <em> Make Clipping Mask</em>. The mask shape becomes invisible and the lower
            object is clipped to its silhouette.
          </P>
          <H>Releasing</H>
          <P>
            Select the clipped object and choose <em>Release Clipping Mask</em>. The
            original mask shape returns to the canvas as an editable path.
          </P>
          <Note>
            Clip masks export cleanly to SVG via <code>&lt;clipPath&gt;</code>. PDF
            export also preserves them. DXF and G-code outputs flatten the clip first.
          </Note>
        </>
      ),
    },

    // ------------- Styling -------------
    {
      id: 'fill-stroke',
      category: t('Styling'),
      title: t('Fill & stroke'),
      keywords: 'color paint outline width',
      body: () => (
        <>
          <P>
            The <strong>Appearance</strong> section of the Properties panel sets the
            fill and stroke for the current selection — or, when nothing is selected,
            the defaults for the next shape you draw. The two large swatches at the top
            are click-to-pick.
          </P>
          <H>Swatches palette</H>
          <P>
            Below the pickers, the <em>Swatches</em> row shows recent and pinned colors.
            Click to apply as fill; <Kbd>Alt</Kbd>-click to apply as stroke. Right-click
            a swatch to remove it. Use <em>Add current fill</em> to pin the active fill
            color into the palette.
          </P>
          <H>Stroke width &amp; opacity</H>
          <P>
            Adjust <strong>Stroke W</strong> for stroke thickness and <strong>Opacity</strong>
            for the whole object (both fill and stroke). For per-channel alpha, use the
            color picker — it supports RGBA and HSLA.
          </P>
          <H>Advanced stroke</H>
          <P>
            The Advanced stroke section adds dash style (solid / dashed / dotted),
            line cap (butt / round / square), and line join (miter / round / bevel).
            These map directly to SVG stroke attributes on export.
          </P>
        </>
      ),
    },
    {
      id: 'gradients',
      category: t('Styling'),
      title: t('Gradients'),
      keywords: 'linear radial stops',
      body: () => (
        <>
          <P>
            The <strong>Gradient</strong> section converts the fill of the current
            selection from a solid color into a multi-stop gradient. Pick a
            <em> Mode </em>(Linear or Radial), add stops as needed, and adjust the
            angle for linear gradients.
          </P>
          <H>Adding stops</H>
          <P>
            Each stop is a color + offset (0–1). Click <em>Add stop</em> to insert one
            at the current cursor position in the gradient strip. Click
            <em> Remove stop </em>to delete the active stop. A minimum of two stops is
            required.
          </P>
          <H>AI-generated gradients</H>
          <P>
            Ask the AI assistant for "a warm sunset gradient on the selected shape"
            and it will call the <code>apply_gradient</code> skill with appropriate
            stops. You can keep iterating ("more orange", "less yellow") and the
            gradient is updated in place.
          </P>
        </>
      ),
    },
    {
      id: 'shadows',
      category: t('Styling'),
      title: t('Drop shadows'),
      keywords: 'shadow elevation depth',
      body: () => (
        <>
          <P>
            The <strong>Drop shadow</strong> section adds a soft shadow under the current
            selection. Toggle the section on, then tune <em>Color</em>, <em>Blur</em>,
            <em> Offset X</em> and <em>Offset Y</em>. Negative offsets cast the shadow
            up and to the left.
          </P>
          <P>
            Shadows export to SVG as <code>&lt;feGaussianBlur&gt;</code> filters wrapped
            in <code>&lt;filter&gt;</code>. They render in PDF as well. For
            plotter / cutter output the shadow is dropped (it's not strokable).
          </P>
        </>
      ),
    },
    {
      id: 'filters',
      category: t('Styling'),
      title: t('SVG filters'),
      keywords: 'blur glow effects',
      body: () => (
        <>
          <P>
            Beyond drop shadows, Anchorworks supports a small set of SVG filter
            effects — Gaussian blur, brightness / contrast, hue rotate, and saturate.
            Access them from the Properties panel when an object is selected; the
            filter parameters are sliders.
          </P>
          <P>
            Filters are layered: applying brightness on top of a blur composes both
            into the SVG <code>&lt;filter&gt;</code> chain. Toggle each filter off
            without losing its parameters; the values are preserved.
          </P>
          <Note>
            Heavy filters on large objects may show a tiny render lag — the canvas
            re-rasterizes the filtered region on every change. Apply once you're
            close to the final position.
          </Note>
        </>
      ),
    },
    {
      id: 'patterns',
      category: t('Styling'),
      title: t('Pattern fills'),
      keywords: 'tile pattern repeat texture',
      body: () => (
        <>
          <P>
            Any image asset can be used as a repeating <strong>pattern fill</strong>.
            Drop an image into the Assets panel, then with a shape selected pick
            <em> Use as pattern fill </em>from the Properties panel.
          </P>
          <P>
            Patterns are anchored to the object's origin and tile in both directions.
            They scale with the object by default — flip to <em>Fixed</em> in
            Properties if you want the pattern to stay aligned to the canvas regardless
            of the host shape's size.
          </P>
        </>
      ),
    },
    {
      id: 'color-picker',
      category: t('Styling'),
      title: t('Color picker'),
      keywords: 'eyedropper hex hsl rgb',
      body: () => (
        <>
          <P>
            Anchorworks ships a fast color picker and a more thorough
            <em> Advanced color picker </em>(reachable via the <em>Adv</em> button
            next to the swatch).
          </P>
          <H>Eyedropper</H>
          <P>
            On Chromium browsers the picker includes an eyedropper — click the
            crosshair icon, then click anywhere on the screen to sample that pixel.
            The sampled color is added to <em>Recent</em>. Firefox and Safari fall back
            to manual entry.
          </P>
          <H>Recent colors</H>
          <P>
            Each color you commit (via the picker or a swatch) is added to a recent-colors
            ring of 24. The ring is persistent across sessions.
          </P>
          <H>Suggest palette</H>
          <P>
            Press <em>Suggest palette</em> to generate a five-color set harmonious with
            your current fill — useful when you're picking an accent for an existing
            scheme.
          </P>
        </>
      ),
    },

    // ------------- Text -------------
    {
      id: 'fonts',
      category: t('Text'),
      title: t('Fonts & uploads'),
      keywords: 'font family upload otf ttf',
      body: () => (
        <>
          <P>
            The font picker lists web-safe fonts plus any fonts you've uploaded for
            this session. Click <em>Upload</em> in the picker to add a <code>.woff</code>,
            <code>.woff2</code>, <code>.otf</code> or <code>.ttf</code> file. The font is
            loaded as a FontFace, registered globally, and immediately available.
          </P>
          <Note>
            Uploaded fonts live in the page only — they're not persisted across
            reloads. When you export to SVG, the text is preserved as
            <code> &lt;text&gt; </code>with the font-family name; the consumer needs
            access to the same font to render it correctly. To guarantee fidelity,
            outline the text first (right-click → <em>Convert to Paths</em>).
          </Note>
          <H>Searching</H>
          <P>
            The picker has a search box — type to filter the family list. The current
            font is shown at the top with a sample.
          </P>
        </>
      ),
    },
    {
      id: 'character',
      category: t('Text'),
      title: t('Character panel'),
      keywords: 'kerning leading tracking size',
      body: () => (
        <>
          <P>
            The <strong>Character panel</strong> exposes fine-grained typographic
            controls beyond family and size: weight, line-height (leading), letter
            spacing (tracking), word spacing, font-style (italic), and decoration
            (underline / strikethrough).
          </P>
          <H>Per-character vs per-object</H>
          <P>
            By default these apply to the whole text object. Double-click into the
            text and select a range to apply attributes to just that range — useful
            for highlighting a single word.
          </P>
          <H>Vertical alignment</H>
          <P>
            For multi-line text objects, the panel includes top / center / bottom
            vertical alignment within the bounding box.
          </P>
        </>
      ),
    },
    {
      id: 'text-on-path',
      category: t('Text'),
      title: t('Text on path'),
      keywords: 'curve flow follow',
      body: () => (
        <>
          <P>
            Place text along an arbitrary path (a circle, a wave, a custom curve).
            Select your text object and a path, right-click, and choose
            <em> Text on path</em>. The text re-flows along the path's direction.
          </P>
          <H>Adjusting</H>
          <UL>
            <li>Edit the path to re-flow the text automatically</li>
            <li>Adjust letter spacing in the Character panel to fit the curve length</li>
            <li>Right-click → <em>Release Text from Path</em> to undo</li>
          </UL>
          <P>
            On export the relationship is encoded as SVG's
            <code> &lt;textPath xlink:href&gt; </code>so it round-trips losslessly.
          </P>
        </>
      ),
    },
    {
      id: 'contrast',
      category: t('Text'),
      title: t('Contrast check'),
      keywords: 'wcag accessibility a11y',
      body: () => (
        <>
          <P>
            The <strong>Contrast checker</strong> (in the right rail or via the
            Properties panel for a selected text object) reports the WCAG contrast
            ratio between two colors — typically your text color and the underlying
            background.
          </P>
          <H>Reading the result</H>
          <P>
            Ratios are reported on the 1:1 to 21:1 scale. The checker labels each
            against the four WCAG tiers: <strong>AA</strong>, <strong>AAA</strong>,
            <strong> AA Large</strong>, and <strong>AAA Large</strong>. A pass means
            your text would clear that tier for the body-text or large-text rules.
          </P>
          <H>Verdict band</H>
          <P>
            Below the numeric ratio, a coloured verdict band summarises:
            <em> Excellent</em>, <em>Good</em>, <em>Fair</em>, or <em>Fail</em>. Use it
            as a quick read before clicking through for the exact tier breakdown.
          </P>
        </>
      ),
    },

    // ------------- Layers & layout -------------
    {
      id: 'layers',
      category: t('Layers & layout'),
      title: t('Layers panel'),
      keywords: 'order visibility lock',
      body: () => (
        <>
          <P>
            The <strong>Layers</strong> panel (right rail) lists every object on the
            canvas in stacking order, top-most first. Click a row to select that object;
            shift-click to add to the selection.
          </P>
          <H>Visibility &amp; lock</H>
          <P>
            Each row has a visibility eye and a lock icon. <em>Hide</em> removes the
            object from the canvas without deleting it; <em>Lock</em> keeps it visible
            but un-selectable. Both states are preserved in project files.
          </P>
          <H>Reordering</H>
          <P>
            Drag rows to reorder, or select an object and use
            <Kbd>Ctrl</Kbd><Kbd>]</Kbd> /
            <Kbd>Ctrl</Kbd><Kbd>[</Kbd> to move it forward / backward by one. Add
            <Kbd>Shift</Kbd> to jump all the way to front or back.
          </P>
          <H>Grouping</H>
          <P>
            Groups are shown as collapsible rows. Their child objects can still be
            selected individually with a double-click into the group.
          </P>
        </>
      ),
    },
    {
      id: 'artboards',
      category: t('Layers & layout'),
      title: t('Artboards'),
      keywords: 'pages multi page',
      body: () => (
        <>
          <P>
            <strong>Artboards</strong> are multiple page regions on a single canvas.
            Use them to lay out a small icon set, a slide deck, or paired
            phone / desktop mocks side by side.
          </P>
          <H>Creating</H>
          <P>
            Open the <em>Artboards</em> panel and click <em>+ New</em>. Set the name,
            position (x / y) and size (width / height). Drag the artboard in the panel
            to reorder it; the on-canvas frame moves accordingly.
          </P>
          <H>Exporting</H>
          <P>
            The SVG / PNG / PDF exports include all artboards by default. To export
            just one, use the artboard row's <em>Export</em> shortcut. Each artboard
            becomes a top-level <code>&lt;g&gt;</code> in the SVG.
          </P>
        </>
      ),
    },
    {
      id: 'symbols',
      category: t('Layers & layout'),
      title: t('Symbols'),
      keywords: 'reusable component instance',
      body: () => (
        <>
          <P>
            A <strong>symbol</strong> is a reusable component — like a button or an icon
            — that can be placed multiple times on the canvas. Edits to the symbol's
            master propagate to every instance.
          </P>
          <H>Creating one</H>
          <P>
            Select a group, then in the Symbols panel click <em>+ Create symbol</em>.
            Give it a name. The selection becomes the master and stays in place as the
            first instance.
          </P>
          <H>Placing instances</H>
          <P>
            Drag a symbol from the panel onto the canvas to drop an instance. Each
            instance can be scaled or rotated independently — but its internal geometry
            is shared. To break the link, right-click the instance and choose
            <em> Detach symbol</em>.
          </P>
        </>
      ),
    },
    {
      id: 'align',
      category: t('Layers & layout'),
      title: t('Align & distribute'),
      keywords: 'arrangement spacing equal',
      body: () => (
        <>
          <P>
            Select two or more objects and the <strong>Align &amp; Distribute</strong>
            panel becomes active. Six align buttons cover the standard L / C / R and
            T / C / B alignments; two distribute buttons spread three-or-more objects
            with equal spacing horizontally or vertically.
          </P>
          <H>Anchor</H>
          <P>
            Alignment is computed against the union bounding box of the selection.
            Use the lock icon to switch the anchor to the canvas or to the active
            artboard instead.
          </P>
          <H>AI alignment</H>
          <P>
            Ask the AI assistant "Tidy up the alignment" and it calls the
            <code> align_objects </code>and <code>distribute_objects</code> skills in
            sequence — useful when you're cleaning up something dropped from
            elsewhere.
          </P>
        </>
      ),
    },
    {
      id: 'smart-guides',
      category: t('Layers & layout'),
      title: t('Smart guides'),
      keywords: 'snap alignment guide',
      body: () => (
        <>
          <P>
            <strong>Smart guides</strong> are the pink lines that appear while dragging,
            showing alignment with other objects' edges and centers. Toggle them via
            the <em>Guides</em> pip in the menu bar, or in View settings.
          </P>
          <H>Snap-to-grid</H>
          <P>
            Independent of smart guides, <em>Snap</em> (also in the menu bar segmented
            control) snaps moves and resizes to the current grid. Adjust grid size in
            Document Settings.
          </P>
          <H>Smart guides vs snap</H>
          <P>
            They compose. With both enabled, a drag prefers a strong grid-snap when in
            range and falls back to smart-guide alignment with neighbouring objects
            otherwise.
          </P>
        </>
      ),
    },

    // ------------- Assets -------------
    {
      id: 'drag-drop',
      category: t('Assets'),
      title: t('Drag-drop import'),
      keywords: 'drop file svg png import',
      body: () => (
        <>
          <P>
            Drop SVG, PNG, JPG, GIF or WEBP files anywhere on the canvas to import
            them. SVGs are imported as native vector groups (each path remains
            editable). Raster images are added as image objects you can resize and
            mask.
          </P>
          <H>Programmatic import</H>
          <P>
            Use <em>File → Open SVG / JSON…</em> for vector files, or
            <em> File → Import Image…</em> for rasters. JSON files are project state
            (see <em>Project files</em>).
          </P>
        </>
      ),
    },
    {
      id: 'image-trace',
      category: t('Assets'),
      title: t('Image trace'),
      keywords: 'vectorize raster convert',
      body: () => (
        <>
          <P>
            Select an imported raster image and click <em>Trace</em> in the Assets
            panel. Anchorworks runs a marching-squares trace on the image's
            silhouette and adds the resulting polygon to the canvas.
          </P>
          <H>Tuning</H>
          <P>
            The default threshold is 50% luminance — pixels above it become path
            interior. Use the threshold slider in the dialog to tune. Heavier images
            may take a second or two to trace; the polygon is added once the worker
            finishes.
          </P>
          <Note>
            Image trace gives you one outline per contiguous region. For multi-color
            artwork, ask the AI assistant to "vectorize this image" — it can split
            the image into color regions and trace each one.
          </Note>
        </>
      ),
    },
    {
      id: 'assets-library',
      category: t('Assets'),
      title: t('Asset library'),
      keywords: 'pinned reuse images',
      body: () => (
        <>
          <P>
            The <strong>Assets</strong> panel keeps thumbnails of every image you've
            imported. Click a thumbnail to drop a fresh instance onto the canvas at
            its native size. Right-click a thumbnail to remove it from the library.
          </P>
          <P>
            Assets are stored in the project file and survive autosave / restore. Use
            them for things you'll reuse across artboards — logos, icons, photo
            placeholders.
          </P>
        </>
      ),
    },

    // ------------- Templates -------------
    {
      id: 'templates',
      category: t('Templates'),
      title: t('Built-in templates'),
      keywords: 'starter preset new from',
      body: () => (
        <>
          <P>
            Templates jump-start a new document with sensible defaults. From the
            <em> File </em>menu pick <em>New from Template…</em> or, from an empty
            canvas, click the same option in the Command Palette
            (<Kbd>Ctrl</Kbd><Kbd>K</Kbd> → <em>New from Template</em>).
          </P>
          <H>What's in a template</H>
          <P>
            Each template seeds the canvas with a layout, a colour palette, sample
            text, and the right page size — Instagram post, A4 portrait, business
            card, social banner, and a few others.
          </P>
          <Note>
            Templates replace the current canvas without prompting. Save your work
            first (<Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>S</Kbd>) if you don't want to
            lose it.
          </Note>
        </>
      ),
    },

    // ------------- AI assistant -------------
    {
      id: 'ai-setup',
      category: t('AI assistant'),
      title: t('AI setup'),
      keywords: 'api key anthropic configure',
      body: () => (
        <>
          <P>
            Click the orange <strong>AI</strong> button (top-right) to open the
            assistant panel. Before the first conversation you'll need to drop in an
            Anthropic API key — click the <em>Settings</em> tab inside the panel and
            paste your key. It's stored in the browser's local storage and never
            leaves your device except as request headers to Anthropic.
          </P>
          <H>Model</H>
          <P>
            The model field accepts any Claude model alias (the default Sonnet works
            well). You can also set a custom <em>Base URL</em> if you proxy requests
            via your own gateway.
          </P>
          <H>Privacy</H>
          <P>
            With the default configuration, only the messages you type and the
            (optional) canvas snapshot are sent to Anthropic. Toggle off
            <em> Enable vision </em>to keep the canvas private.
          </P>
        </>
      ),
    },
    {
      id: 'ai-vision',
      category: t('AI assistant'),
      title: t('AI vision'),
      keywords: 'screenshot canvas see image',
      body: () => (
        <>
          <P>
            When <em>Vision</em> is on, the assistant receives a PNG snapshot of your
            canvas with each message. This lets it reason about layout, balance, colour,
            and overlap — the things it would otherwise be blind to.
          </P>
          <H>What it costs</H>
          <P>
            Snapshots are sent at a downscaled resolution (max ~1024 px on the longest
            edge) to stay within Anthropic's image-token budget. Even so, vision
            requests cost a little more than text-only. Turn it off for plain skill
            invocations ("undo my last 5 changes", "set my fill to red").
          </P>
          <H>What the assistant sees</H>
          <P>
            Exactly what you see on-screen: artboards, layers (visible ones), the active
            selection's bounding box, smart guides, and the grid (if visible). It does
            not see your file system, your other tabs, or any browser history.
          </P>
        </>
      ),
    },
    {
      id: 'ai-skills',
      category: t('AI assistant'),
      title: t('Tools & skills'),
      keywords: 'mcp skill registered',
      body: () => (
        <>
          <P>
            <strong>Skills</strong> are concrete actions the assistant can take. Each
            skill is registered with a JSON schema; the model decides when to call them
            based on your message. The complete list is in the
            <em> MCP / Skills </em>tab of the AI panel.
          </P>
          <H>Built-in skills</H>
          <UL>
            <li><code>align_objects</code>, <code>distribute_objects</code> — layout</li>
            <li><code>set_fill</code>, <code>set_stroke</code>, <code>apply_gradient</code>, <code>apply_shadow</code> — styling</li>
            <li><code>boolean_op</code> — pathfinder operations</li>
            <li><code>group_selection</code>, <code>ungroup_selection</code>, <code>duplicate_selection</code>, <code>delete_selection</code> — structure</li>
            <li><code>resize_canvas</code>, <code>set_background</code> — document</li>
            <li><code>show_toast</code> — surface a notification</li>
          </UL>
          <P>
            All skills are deterministic, type-checked, and run synchronously. They
            cannot reach outside the canvas (no network, no file system).
          </P>
        </>
      ),
    },
    {
      id: 'mcp',
      category: t('AI assistant'),
      title: t('MCP servers'),
      keywords: 'model context protocol external',
      body: () => (
        <>
          <P>
            <strong>MCP</strong> (Model Context Protocol) lets you plug in remote tool
            servers that the assistant can call. Add a server URL in the
            <em> MCP / Skills </em>tab — Anchorworks fetches the server's tool
            manifest and exposes the tools to Claude on its next call.
          </P>
          <H>Typical uses</H>
          <UL>
            <li>Fetch real-time data (weather, currency rates) for data-driven layouts</li>
            <li>Lookup design tokens from your team's Figma file or token store</li>
            <li>Call a private illustration model for raster generation</li>
          </UL>
          <H>Health checks</H>
          <P>
            Each server has a <em>Test</em> button that pings the server's manifest
            endpoint. A red dot means the server is unreachable; a green dot means
            its tools are loaded and ready.
          </P>
        </>
      ),
    },
    {
      id: 'ai-quick',
      category: t('AI assistant'),
      title: t('Quick actions'),
      keywords: 'preset critique palette icon',
      body: () => (
        <>
          <P>
            The Command Palette includes four single-click AI presets:
          </P>
          <UL>
            <li><strong>✨ Critique design</strong> — three actionable improvements</li>
            <li><strong>🎨 Better palette</strong> — recolours your canvas harmoniously</li>
            <li><strong>📐 Tidy alignment</strong> — aligns and distributes everything</li>
            <li><strong>🧩 Convert to icon set</strong> — produces a flat icon grid</li>
          </UL>
          <P>
            Each preset copies a prompt to your clipboard and opens the AI panel.
            Paste, hit send, and the assistant runs the relevant skills. The presets
            are good starting points to write your own — the prompts are deliberately
            specific so the model picks the right skills.
          </P>
        </>
      ),
    },

    // ------------- Plotter & cutter -------------
    {
      id: 'gcode',
      category: t('Plotter & cutter'),
      title: t('G-code output'),
      keywords: 'cnc pen plotter export',
      body: () => (
        <>
          <P>
            Anchorworks generates <strong>G-code</strong> for pen plotters, laser
            engravers and small CNC machines. Open the Plotter dialog (top-right
            <em> Plotter </em>button, or <em>File → Send to Plotter…</em>) and pick
            <em> G-code </em>as the format.
          </P>
          <H>Key parameters</H>
          <UL>
            <li><strong>Unit</strong> — mm or inches; coordinates are emitted accordingly</li>
            <li><strong>Feed rate</strong> — drawing speed (mm/min)</li>
            <li><strong>Travel rate</strong> — speed between strokes when pen is up</li>
            <li><strong>Pen down Z</strong> / <strong>Pen up Z</strong> — Z heights for engaged and lifted pen</li>
            <li><strong>Curve tolerance</strong> — how finely bezier curves are flattened into line segments</li>
            <li><strong>Origin</strong> — bottom-left (CNC convention) or top-left</li>
          </UL>
          <H>Preview &amp; save</H>
          <P>
            Click <em>Generate Preview</em> to see the toolpath visualisation. Then
            <em> Save File </em>to download the .gcode, or <em>Send via USB</em> to
            stream directly (see <em>Web Serial USB</em>).
          </P>
        </>
      ),
    },
    {
      id: 'hpgl',
      category: t('Plotter & cutter'),
      title: t('HP-GL output'),
      keywords: 'vinyl cutter plotter hpgl',
      body: () => (
        <>
          <P>
            <strong>HP-GL</strong> (Hewlett-Packard Graphics Language) is the standard for
            vinyl cutters and older pen plotters. Select <em>HP-GL</em> in the Plotter
            dialog and the same canvas geometry is encoded as <code>PA</code> /
            <code> PD</code> / <code>PU</code> commands.
          </P>
          <H>Per-plotter quirks</H>
          <P>
            Different cutters expect slightly different command headers. The default
            preamble works for most Roland and Graphtec machines. If your cutter cuts
            crooked or mirrored, flip the <em>Origin at bottom-left</em> toggle and
            re-generate.
          </P>
        </>
      ),
    },
    {
      id: 'web-serial',
      category: t('Plotter & cutter'),
      title: t('Web Serial USB'),
      keywords: 'usb stream connect device',
      body: () => (
        <>
          <P>
            <strong>Web Serial</strong> lets the browser talk directly to USB-connected
            plotters and cutters. Generate your G-code / HP-GL, then click
            <em> Send via USB </em>— the browser prompts you to pick a serial device,
            and Anchorworks streams the commands.
          </P>
          <H>Browser support</H>
          <P>
            Web Serial is available in Chrome and Edge on HTTPS (or
            <code> localhost</code>). Firefox and Safari currently don't support it —
            in those browsers, use <em>Save File</em> and send the file via your
            plotter's own utility.
          </P>
          <Note>
            The first time you send, the browser shows a permission prompt. Pick your
            plotter, click <em>Connect</em>, and the permission is remembered for the
            session.
          </Note>
        </>
      ),
    },
    {
      id: 'plotter-options',
      category: t('Plotter & cutter'),
      title: t('Plotter options'),
      keywords: 'feed travel pen z paper',
      body: () => (
        <>
          <P>
            The Plotter dialog's full option set:
          </P>
          <UL>
            <li><strong>Format</strong> — G-code or HP-GL</li>
            <li><strong>Unit</strong> — mm or inches</li>
            <li><strong>Feed rate</strong> — drawing speed</li>
            <li><strong>Travel rate</strong> — speed between strokes</li>
            <li><strong>Pen down Z</strong> / <strong>Pen up Z</strong> — engagement heights (G-code only)</li>
            <li><strong>Paper height</strong> — used when flipping Y for bottom-left origin</li>
            <li><strong>Curve tolerance (px)</strong> — bezier-to-segment flatten tolerance</li>
            <li><strong>Origin at bottom-left</strong> — CNC convention; default true</li>
          </UL>
          <P>
            Sensible defaults are filled in for most pen plotters. The settings are
            persisted in your browser so you don't re-enter them every session.
          </P>
        </>
      ),
    },

    // ------------- Printing -------------
    {
      id: 'print-pages',
      category: t('Printing'),
      title: t('Page sizes'),
      keywords: 'print paper a4 letter',
      body: () => (
        <>
          <P>
            The Print dialog (<Kbd>Ctrl</Kbd><Kbd>P</Kbd>) supports standard ISO and
            US page sizes — A3 / A4 / A5, Letter, Legal, Tabloid — plus a free-form
            <em> Custom </em>option where you enter width and height in mm. Pick
            <em> Orientation </em>(Portrait or Landscape) and Anchorworks rotates
            the page underneath your canvas accordingly.
          </P>
          <H>Scaling modes</H>
          <UL>
            <li><strong>Actual size</strong> — print at 1:1, may clip if the canvas exceeds the page</li>
            <li><strong>Fit to page</strong> — scale uniformly so the entire canvas fits on one page</li>
            <li><strong>Fill page</strong> — scale to fill the page, cropping the longer dimension</li>
          </UL>
        </>
      ),
    },
    {
      id: 'print-bleed',
      category: t('Printing'),
      title: t('Bleed & margins'),
      keywords: 'crop print margin',
      body: () => (
        <>
          <P>
            <strong>Margin</strong> (mm) sets a uniform inset on all four sides of the
            page. Useful for printers that can't print edge-to-edge, or when you want
            a guaranteed safe zone around your artwork.
          </P>
          <P>
            For commercial printing with a true bleed, design with your content
            extending slightly past the canvas edge, then export at the bleed
            dimensions plus crop marks. The PDF export preserves this exactly.
          </P>
        </>
      ),
    },
    {
      id: 'tile-print',
      category: t('Printing'),
      title: t('Tile print'),
      keywords: 'poster multi page large',
      body: () => (
        <>
          <P>
            <strong>Tile Print</strong> splits a large canvas across multiple A4 pages
            — handy for posters or wall plots that don't fit on one sheet. From
            <em> File → Tile Print…</em>, enter the number of columns and rows; Vector
            Studio assembles a multi-page print preview where each page shows a slice.
          </P>
          <P>
            Each tile includes a small overlap so you can align and tape the pages
            together. Choose 3×3 for an A4 → A1 poster; 4×4 gives you something close
            to A0.
          </P>
        </>
      ),
    },

    // ------------- Save & restore -------------
    {
      id: 'autosave',
      category: t('Save & restore'),
      title: t('Autosave'),
      keywords: 'recovery local storage backup',
      body: () => (
        <>
          <P>
            Anchorworks autosaves to your browser's local storage every few seconds
            after a change. The save indicator in the menu bar shows the current state:
          </P>
          <UL>
            <li>Green dot — saved, no unsaved changes</li>
            <li>Yellow dot — there are unsaved changes (autosave is debounced)</li>
            <li>Muted dot — nothing has been saved this session yet</li>
          </UL>
          <P>
            Click the indicator to save immediately. The label shows
            <em> Saved just now</em>, <em>Saved 12s ago</em>, etc.
          </P>
          <H>What's autosaved</H>
          <P>
            The canvas geometry, document settings, layers, artboards, symbols and
            asset library — everything except the (uploaded, non-persistent) custom
            fonts. AI history and API keys live in their own storage entries.
          </P>
        </>
      ),
    },
    {
      id: 'project-files',
      category: t('Save & restore'),
      title: t('Project files'),
      keywords: 'save load vector project json',
      body: () => (
        <>
          <P>
            For long-term storage, use the project file format: a JSON document that
            captures everything in the workspace. From the File menu:
          </P>
          <UL>
            <li><strong>Save Project</strong> (<Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>S</Kbd>) — write to the current file handle (or prompt for one)</li>
            <li><strong>Save Project As…</strong> — always prompts for a location</li>
            <li><strong>Open Project…</strong> — load a .json project file</li>
          </UL>
          <H>File handles</H>
          <P>
            On browsers that support the File System Access API (Chrome, Edge), the
            project file is kept open by handle — subsequent saves write directly with
            no picker. On other browsers, every save prompts for a download location.
          </P>
        </>
      ),
    },
    {
      id: 'recovery',
      category: t('Save & restore'),
      title: t('Recovery'),
      keywords: 'crash restore last session',
      body: () => (
        <>
          <P>
            If Anchorworks crashes or the tab is closed with unsaved changes, the
            next launch shows a <strong>Recovery</strong> dialog offering to restore
            the autosaved state. You'll see the timestamp of the saved copy.
          </P>
          <P>
            Click <em>Restore</em> to load it, or <em>Discard</em> to start fresh.
            Choosing discard clears the autosave entry — recovery isn't offered again
            on the next launch until something new triggers an autosave.
          </P>
          <Note>
            Recovery operates on the most recent autosave only. If you want
            longer-term safety, save explicit project files (above) — they're not
            limited by local-storage quota.
          </Note>
        </>
      ),
    },

    // ------------- Shortcuts -------------
    {
      id: 'shortcuts',
      category: t('Keyboard shortcuts'),
      title: t('Full shortcut reference'),
      keywords: 'hotkey keys keyboard',
      body: () => (
        <>
          <P>
            A complete list of keyboard shortcuts. This is also available as a focused
            dialog via <Kbd>?</Kbd> at any time.
          </P>
          <H>Tools</H>
          <UL>
            <li><Kbd>V</Kbd> Select &nbsp;·&nbsp; <Kbd>R</Kbd> Rectangle &nbsp;·&nbsp; <Kbd>E</Kbd> Ellipse</li>
            <li><Kbd>L</Kbd> Line &nbsp;·&nbsp; <Kbd>G</Kbd> Polygon &nbsp;·&nbsp; <Kbd>P</Kbd> Pen</li>
            <li><Kbd>B</Kbd> Pencil &nbsp;·&nbsp; <Kbd>X</Kbd> Eraser &nbsp;·&nbsp; <Kbd>T</Kbd> Text</li>
            <li><Kbd>H</Kbd> Hand &nbsp;·&nbsp; <Kbd>Z</Kbd> Zoom &nbsp;·&nbsp; <Kbd>Space</Kbd> temporary Hand</li>
          </UL>
          <H>Edit</H>
          <UL>
            <li><Kbd>Ctrl</Kbd><Kbd>Z</Kbd> Undo &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>Y</Kbd> Redo</li>
            <li><Kbd>Ctrl</Kbd><Kbd>A</Kbd> Select all &nbsp;·&nbsp; <Kbd>Esc</Kbd> Deselect</li>
            <li><Kbd>Ctrl</Kbd><Kbd>D</Kbd> Duplicate &nbsp;·&nbsp; <Kbd>Delete</Kbd> Delete</li>
            <li><Kbd>Ctrl</Kbd><Kbd>C</Kbd> / <Kbd>Ctrl</Kbd><Kbd>X</Kbd> / <Kbd>Ctrl</Kbd><Kbd>V</Kbd> Copy / Cut / Paste</li>
            <li><Kbd>Ctrl</Kbd><Kbd>G</Kbd> Group &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>G</Kbd> Ungroup</li>
            <li><Kbd>Ctrl</Kbd><Kbd>]</Kbd> Bring Forward &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>[</Kbd> Send Backward</li>
            <li><Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>]</Kbd> Bring to Front &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>[</Kbd> Send to Back</li>
            <li>Arrow keys nudge 1 px &nbsp;·&nbsp; <Kbd>Shift</Kbd>+arrows nudge 10 px</li>
          </UL>
          <H>File / View</H>
          <UL>
            <li><Kbd>Ctrl</Kbd><Kbd>S</Kbd> Export SVG &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>S</Kbd> Save Project</li>
            <li><Kbd>Ctrl</Kbd><Kbd>O</Kbd> Open &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>P</Kbd> Print</li>
            <li><Kbd>Ctrl</Kbd><Kbd>=</Kbd> Zoom in &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>-</Kbd> Zoom out &nbsp;·&nbsp; <Kbd>Ctrl</Kbd><Kbd>0</Kbd> Fit</li>
            <li><Kbd>Ctrl</Kbd><Kbd>K</Kbd> Command Palette &nbsp;·&nbsp; <Kbd>F1</Kbd> Help Center &nbsp;·&nbsp; <Kbd>?</Kbd> Shortcuts dialog</li>
          </UL>
          <H>Added since Wave 10</H>
          <UL>
            <li><Kbd>Ctrl</Kbd><Kbd>,</Kbd> Preferences (open the settings dialog)</li>
            <li><Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>L</Kbd> Toggle light / dark theme</li>
            <li><Kbd>Ctrl</Kbd><Kbd>1</Kbd> Zoom to 100% (actual size)</li>
            <li><Kbd>Ctrl</Kbd><Kbd>Alt</Kbd><Kbd>Y</Kbd> Toggle outline view (wireframe preview)</li>
            <li><Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>S</Kbd> Save Project (introduced in Wave 12 alongside file-handle saves)</li>
          </UL>
          <Note>
            Almost every shortcut on this page is now <strong>rebindable</strong> —
            open <em>Help → Customize Shortcuts…</em> to pick your own combos. See the
            <em> Customize Shortcuts </em>topic for details.
          </Note>
        </>
      ),
    },

    // ------------- Accessibility -------------
    {
      id: 'a11y',
      category: t('Accessibility'),
      title: t('Accessibility features'),
      keywords: 'a11y aria skip focus contrast motion',
      body: () => (
        <>
          <P>
            Anchorworks is built keyboard-first. Every tool, menu and dialog is
            reachable via <Kbd>Tab</Kbd>; visible focus rings make the current target
            obvious; an aria-live region announces actions (undo, copy, tool changes)
            so screen-reader users hear what happened.
          </P>
          <H>Skip link</H>
          <P>
            A keyboard-only <em>Skip to canvas</em> link appears at the very top of
            the page when you press <Kbd>Tab</Kbd> from the address bar. Press
            <Kbd>Enter</Kbd> to jump focus straight to the canvas, bypassing the menu
            bar and toolbar.
          </P>
          <H>Reduced motion</H>
          <P>
            If your OS sets <code>prefers-reduced-motion</code>, all dialog enter
            animations, tool icon transitions and zoom interpolations are reduced or
            disabled. No setting is needed — Anchorworks respects the system flag.
          </P>
          <H>High contrast</H>
          <P>
            Toggle <em>High Contrast</em> from the Help menu to switch to a higher-contrast
            theme — sharper borders, bolder text, and clearer panel separation. The
            preference persists per browser.
          </P>
          <H>Touch support</H>
          <P>
            Multi-touch is supported: one-finger drag pans, two-finger pinch zooms,
            and the eraser HUD scales with stylus pressure. The mobile sheet behaviour
            (right sidebar slides over on screens under 900 px) keeps the canvas the
            primary surface on phones and tablets.
          </P>
        </>
      ),
    },

    // ------------- Styling (added after Wave 10) -------------
    {
      id: 'stroke-alignment',
      category: t('Styling'),
      title: 'Stroke alignment',
      keywords: 'stroke center inside outside align position',
      body: () => (
        <>
          <P>
            Shipped in Wave 13, <strong>Stroke alignment</strong> controls where the
            stroke sits relative to a path's geometric edge. Three options live in the
            Properties panel under <em>Advanced Stroke</em>:
            <strong> Center</strong>, <strong>Inside</strong>, and <strong>Outside</strong>.
            The default is Center — exactly half the stroke width falls on either side
            of the path.
          </P>
          <H>Picture it</H>
          <P>
            Imagine a 100 × 100 square with a 10 px stroke. With <strong>Center</strong>,
            the visible outline runs from x = -5 to x = 105 horizontally — five pixels
            spill outside the path and five spill in. With <strong>Inside</strong>, the
            outline sits flush against x = 0 and x = 100; the entire 10 px lives within
            the original bounding box. With <strong>Outside</strong>, the geometry stays
            untouched but the stroke balloons out to x = -10 / x = 110, doubling the
            visual footprint.
          </P>
          <H>When to pick which</H>
          <UL>
            <li><strong>Center</strong> — neutral default; matches what raw SVG renderers do.</li>
            <li><strong>Inside</strong> — keeps your bounding box honest; great for icon sets where the artwork must fit a 24 × 24 grid.</li>
            <li><strong>Outside</strong> — makes a path "thicker" without shrinking its silhouette; handy for halo / highlight effects around a logo.</li>
          </UL>
          <H>Quirks</H>
          <P>
            SVG itself doesn't have a native "inside" or "outside" attribute, so Vector
            Studio implements those modes by emitting a hidden clip-path or an
            offset-path on export. Round-trips through other editors may flatten the
            effect back to a centered stroke — re-apply the alignment after re-import.
            Open paths only honour Center reliably; on inside / outside the renderer
            falls back to center for any sub-path that isn't closed.
          </P>
        </>
      ),
    },

    // ------------- Drawing & paths (added after Wave 10) -------------
    {
      id: 'repeat-transforms',
      category: t('Drawing & paths'),
      title: 'Repeat transforms',
      keywords: 'pattern grid radial mirror array clone',
      body: () => (
        <>
          <P>
            <strong>Repeat…</strong> (Document menu → <em>Repeat…</em>) duplicates the
            current selection in a regular pattern. The dialog supports three modes —
            <strong> Grid</strong>, <strong>Radial</strong>, and <strong>Mirror</strong> —
            and previews the result live before you commit.
          </P>
          <H>Grid</H>
          <P>
            Lays out copies on a regular grid. Set <em>Columns</em>, <em>Rows</em>, and
            <em> Spacing</em> (px) in both axes. Useful for pattern fills, polka-dot
            backgrounds, contact-sheet thumbnails, or building a quick icon strip.
            With 1 row / N columns you get a horizontal stripe; with N rows / 1
            column, a vertical column.
          </P>
          <H>Radial</H>
          <P>
            Lays out copies around a center point. Set <em>Count</em> and an optional
            <em> Sweep angle </em>(360° by default for a full ring; 180° for a
            half-ring). Each copy is rotated to face outwards, so a single triangle
            becomes a star, a single petal becomes a flower, and a single tick mark
            becomes a clock face. Ideal for radial logos and dial markings.
          </P>
          <H>Mirror</H>
          <P>
            Drops a single reflected copy across an axis — horizontal, vertical, or
            both. Both-axis mirroring produces a four-way kaleidoscope from any
            single shape; combine with the resulting compound path for symmetrical
            ornamental work.
          </P>
          <Note>
            Repeat is non-destructive while the dialog is open — adjust counts and
            spacing in real time. Commit with <em>Apply</em>; the new objects become
            normal canvas items, fully editable individually.
          </Note>
        </>
      ),
    },

    // ------------- Layers & layout (added after Wave 10) -------------
    {
      id: 'anchor-snap',
      category: t('Layers & layout'),
      title: 'Anchor snap',
      keywords: 'snap anchor corner midpoint center node guide',
      body: () => (
        <>
          <P>
            <strong>Anchor snap</strong> (new in Wave 14) snaps a drag to <em>features</em>
            of other objects on the canvas, not just to the grid. Toggle it via the
            <em> Anchor </em>pip in the menu bar's segmented control — it sits alongside
            Grid, Snap, and Guides. When on, dragging an object — or a single
            anchor in path-edit mode — magnetically locks onto nearby reference points.
          </P>
          <H>What it snaps to</H>
          <UL>
            <li><strong>Corners</strong> — the four corners of every object's bounding box</li>
            <li><strong>Edge midpoints</strong> — top, bottom, left, right midpoints of each bounding box</li>
            <li><strong>Object centers</strong> — the geometric center of each object</li>
            <li><strong>Path anchors</strong> — every node on every path, including converted shapes and pen-tool output</li>
          </UL>
          <H>Tolerance &amp; feedback</H>
          <P>
            The snap radius is <strong>6 pixels</strong> in screen space — large enough
            to feel sticky, small enough that you can still drag freely between
            features. When a snap fires, a cyan cross-hair marker appears over the
            target point. Release the drag and the marker disappears.
          </P>
          <H>Composing with other snaps</H>
          <P>
            Anchor snap stacks with smart guides and grid snap. If a corner-snap is
            within range, it wins over a grid-snap (anchor targets are more specific
            and usually what you intended). To temporarily disable, hold
            <Kbd>Ctrl</Kbd> while dragging — that bypasses all snaps including
            anchor and grid.
          </P>
        </>
      ),
    },
    {
      id: 'inspector-panel',
      category: t('Layers & layout'),
      title: 'Inspector panel',
      keywords: 'inspect stats document area palette size bounding',
      body: () => (
        <>
          <P>
            The <strong>Inspect</strong> panel (Wave 9) sits in the right sidebar and
            reports live, read-only statistics about the current document. It is
            collapsible like every other inspector — click the header to fold it
            shut when you don't need it.
          </P>
          <H>What it tracks</H>
          <UL>
            <li><strong>Object count</strong> — broken down by type (paths, shapes, text, images, groups, symbols)</li>
            <li><strong>Total path length</strong> — the sum of every stroke's length in current document units</li>
            <li><strong>Total area</strong> — the union area of every filled object</li>
            <li><strong>Estimated SVG size</strong> — a quick byte-count for the export, useful when you're targeting an inline-SVG budget</li>
            <li><strong>Bounding box</strong> — the union x / y / width / height of everything on the canvas</li>
            <li><strong>Palette</strong> — the unique fill colours currently in use, ordered by frequency</li>
          </UL>
          <H>Palette swatches</H>
          <P>
            Each palette entry is a clickable swatch. Click once and the hex value is
            copied to your clipboard — a small <em>Copied</em> toast confirms. Useful
            when you're matching a colour from elsewhere on the canvas without
            opening the eyedropper.
          </P>
          <H>What it isn't</H>
          <P>
            Inspect is read-only — no editing happens here. For changing fills,
            re-selecting by colour, or filtering layers by type, use the Properties,
            Layers, and Align &amp; Distribute panels respectively. Inspect is the
            "dashboard" view.
          </P>
        </>
      ),
    },

    // ------------- Save & restore (added after Wave 10) -------------
    {
      id: 'recent-files',
      category: t('Save & restore'),
      title: 'Recent files',
      keywords: 'lru history reopen recent fs access',
      body: () => (
        <>
          <P>
            <strong>File → Recent</strong> opens a submenu listing the eight most
            recently saved or opened project files (an LRU). New in Wave 12, it lives
            next to Open / Save and is the fastest way back to a project you were
            just working on.
          </P>
          <H>How it remembers</H>
          <P>
            On browsers with File System Access API support (Chrome, Edge), Vector
            Studio stores the file handle in IndexedDB along with the file's name and
            a timestamp. Click an entry to reopen the file directly — no picker, no
            re-navigation. On other browsers the entry still appears, but selecting
            it falls back to the standard <em>Open Project…</em> picker because no
            persistent handle exists.
          </P>
          <H>Security re-confirm</H>
          <P>
            Browsers require the user to re-confirm permission on a file handle if a
            new tab / session is opening it. The first time you click a Recent entry
            after a fresh launch, you'll see a tiny <em>Allow</em> prompt — that's the
            browser's security model, not Anchorworks holding back. Subsequent
            opens within the same session are silent.
          </P>
          <H>Clearing</H>
          <P>
            The submenu has a <em>Clear Recent</em> item at the bottom that wipes the
            list and removes all stored file handles. Use it before screen-sharing or
            handing off your laptop. The list also self-prunes if you delete files
            from disk — entries that fail to open are removed automatically.
          </P>
        </>
      ),
    },

    // ------------- Accessibility (added after Wave 10) -------------
    {
      id: 'wcag-contrast',
      category: t('Accessibility'),
      title: 'WCAG contrast checker',
      keywords: 'wcag aa aaa contrast ratio luminance a11y',
      body: () => (
        <>
          <P>
            When a text object is selected, the Properties panel grows a
            <strong> WCAG contrast checker </strong>section (Wave 9). It compares your
            text colour against the effective background and reports whether the
            combination passes each of the four standard WCAG 2.1 tiers.
          </P>
          <H>How it picks the background</H>
          <P>
            The checker walks the canvas stack from the text downwards, looking for
            the first opaque fill that lies beneath the text's bounding box — a
            background rectangle, an artboard fill, or finally the document's page
            colour. It does not naively use white; it actually finds what's underneath.
            Move the text over a different shape and the ratio updates live.
          </P>
          <H>The four badges</H>
          <UL>
            <li><strong>AA</strong> — body text ≥ 4.5:1 contrast ratio (the everyday standard)</li>
            <li><strong>AAA</strong> — body text ≥ 7:1 (stricter; preferred for long-form reading)</li>
            <li><strong>AA Large</strong> — ≥ 3:1 for text 18 pt+ regular or 14 pt+ bold</li>
            <li><strong>AAA Large</strong> — ≥ 4.5:1 for the same large-text definition</li>
          </UL>
          <H>Reading the numbers</H>
          <P>
            The ratio itself ranges from 1:1 (identical colours, invisible) to 21:1
            (pure black on pure white). Above each badge, the panel shows the raw
            ratio with two-decimal precision; below, a coloured verdict band gives a
            quick read — <em>Excellent</em>, <em>Good</em>, <em>Fair</em>, or
            <em> Fail</em>. Aim for AA at minimum on any text users will read; aim for
            AAA when accessibility is a stated priority.
          </P>
        </>
      ),
    },

    // ------------- View (new category, Wave 12-13) -------------
    {
      id: 'outline-view',
      category: t('View'),
      title: 'Outline View',
      keywords: 'wireframe outline preview hidden hollow xray',
      body: () => (
        <>
          <P>
            <strong>Outline View</strong> (<Kbd>Ctrl</Kbd><Kbd>Alt</Kbd><Kbd>Y</Kbd>,
            also under View → <em>Outline View</em>) renders the entire canvas as
            unfilled wireframes — every path drawn as a 1-pixel stroke with no fill,
            no shadow, no gradient. It's the design equivalent of an X-ray view, and
            new since Wave 12.
          </P>
          <H>Why it helps</H>
          <UL>
            <li><strong>Overlapping geometry</strong> — when two filled shapes occupy the same region, the lower one is invisible in normal view. Outline reveals both outlines so you can see what's actually there.</li>
            <li><strong>Mask debugging</strong> — a clip-path that hides too much can be hard to spot when its target is solid-filled. In outline, the clipping geometry and the underlying path both render, making the mismatch obvious.</li>
            <li><strong>Hidden paths</strong> — zero-stroke / zero-fill paths are invisible normally but visible in outline. Useful when AI skills or imported SVGs leave debris on the canvas.</li>
            <li><strong>Anchor counts</strong> — at 1-px stroke the node density is much easier to read; great for finding paths with too many anchors before exporting to a plotter.</li>
          </UL>
          <H>Toggling off</H>
          <P>
            Press <Kbd>Ctrl</Kbd><Kbd>Alt</Kbd><Kbd>Y</Kbd> again, or pick
            <em> View → Outline View </em>a second time — the menu entry shows a check
            mark while active. Outline state is per-session; it never persists across
            reloads, so a refresh always brings you back to the normal preview.
          </P>
        </>
      ),
    },
    {
      id: 'light-theme',
      category: t('View'),
      title: 'Light theme & auto theme',
      keywords: 'light dark theme auto system prefers color scheme high contrast',
      body: () => (
        <>
          <P>
            Anchorworks shipped a full light theme in Wave 13. Toggle between dark
            and light with <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>L</Kbd>, or from the
            Help menu via <em>Light Theme</em> / <em>Dark Theme</em>. The toggle is
            instant — colours animate smoothly so nothing flashes.
          </P>
          <H>Auto theme on first run</H>
          <P>
            On the very first launch, Anchorworks reads your operating system's
            <code> prefers-color-scheme </code>media query and picks the matching
            theme. Dark macOS or dark Windows → dark theme; the light counterparts →
            light theme. Once you switch manually, your explicit choice is remembered
            in localStorage and the OS hint is ignored on subsequent loads.
          </P>
          <H>Splash &amp; modals follow</H>
          <P>
            The splash screen (the brief loading panel during initial boot) is
            theme-aware, so a dark-mode user never sees a white flash. Dialogs,
            tooltips, the AI panel, and every inspector inherit the same palette —
            there are no themed island surfaces left.
          </P>
          <H>High contrast is separate</H>
          <P>
            <em>High Contrast</em> (also under the Help menu) is an independent
            toggle. It composes on top of light or dark — high-contrast light gives
            you crisp blacks on bright white; high-contrast dark gives near-pure
            white on near-pure black. Use it for low-vision needs or for video / demo
            screen recordings where panel separation has to read at a distance.
          </P>
        </>
      ),
    },

    // ------------- Preferences (new category, Wave 15) -------------
    {
      id: 'preferences',
      category: t('Preferences'),
      title: 'Preferences',
      keywords: 'preferences settings options config',
      body: () => (
        <>
          <P>
            Preferences (<Kbd>Ctrl</Kbd><Kbd>,</Kbd>, also <em>Help → Preferences…</em>)
            is the central settings dialog introduced in Wave 15. It bundles
            everything that used to be scattered across panels and ad-hoc menu items
            into four tabs.
          </P>
          <H>General</H>
          <P>
            The starting tab. Pick your interface <em>Language</em> (English / 中文),
            the <em>Default theme</em> (System / Light / Dark), the
            <em> Default canvas size </em>(width × height in pixels for new documents),
            and the <em>Autosave interval</em> (seconds between background autosaves;
            zero disables the timer entirely).
          </P>
          <H>AI</H>
          <P>
            Everything the assistant needs to talk to a model: your Anthropic
            <em> API key </em>(masked input; never sent anywhere except request
            headers), the <em>Model</em> alias (Sonnet by default), an optional custom
            <em> Base URL </em>for proxying through your own gateway, plus toggles for
            <em> Vision </em>(send canvas snapshots) and <em>Streaming</em> (incremental
            reply rendering vs. wait-for-whole-message).
          </P>
          <H>Editor</H>
          <P>
            Snap-related defaults — turn Grid snap, Smart guide snap, and Anchor
            snap on or off at the document level. These mirror the segmented control
            in the menu bar; setting them here makes the default sticky across new
            documents instead of just the current session.
          </P>
          <H>Workspace</H>
          <P>
            Visual chrome: <em>Theme</em> override (separate from the default — lets
            you force a theme even on auto) and a <em>High contrast</em> toggle that
            sharpens borders and bolds text throughout the UI.
          </P>
          <H>Where it lives &amp; how to reset</H>
          <P>
            All preferences serialise to <code>localStorage</code> under the key
            <code> vector.prefs</code>. To reset everything to defaults, scroll to the
            bottom of any tab and click <em>Reset to defaults</em>. To wipe just one
            tab's worth, click <em>Reset this tab</em>. To nuke from outside the app
            (e.g. when debugging), open DevTools and run
            <code> localStorage.removeItem('vector.prefs') </code>then refresh.
          </P>
        </>
      ),
    },
    {
      id: 'customize-shortcuts',
      category: t('Preferences'),
      title: 'Customize Shortcuts',
      keywords: 'rebind keymap hotkey customize keyboard',
      body: () => (
        <>
          <P>
            Every key binding in Anchorworks is rebindable. Open the editor from
            <em> Help → Customize Shortcuts… </em>(Wave 15). The dialog lists every
            registered action grouped by category — Tools, Edit, View, File, AI — with
            its current binding on the right.
          </P>
          <H>Rebinding a row</H>
          <P>
            Click any row's binding cell. The cell flips into capture mode and the
            label changes to <em>Press a key combination…</em>. Press the combo you
            want — <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>D</Kbd> for example — and the
            dialog records it instantly. If the combo is already used elsewhere,
            Anchorworks warns you and offers to reassign or cancel. Press
            <Kbd>Esc</Kbd> at any point during capture to bail without changing
            anything.
          </P>
          <H>Resetting</H>
          <P>
            Each row has a <em>Reset</em> button that restores that one action to its
            factory default. At the top of the dialog, <em>Reset All</em> wipes every
            custom binding in one go — useful if you've made a mess and want a
            clean slate.
          </P>
          <H>Where it's stored</H>
          <P>
            Customisations persist to <code>localStorage</code> under the key
            <code> vector.keymap</code>. The store holds only the diffs from the
            defaults, so a fresh install with an empty keymap is indistinguishable
            from one where every shortcut has been "reset". Manually clear the key in
            DevTools to start from scratch outside the dialog.
          </P>
          <H>What can't be rebound</H>
          <P>
            A small handful of shortcuts are excluded by design — they're owned by
            the browser or by the OS, and intercepting them creates more pain than
            value:
          </P>
          <UL>
            <li><Kbd>F1</Kbd> Help Center — always opens the Help Center; matches the OS / browser convention for "help".</li>
            <li><Kbd>Esc</Kbd> Close modal / deselect — too foundational; almost every dialog assumes it works.</li>
            <li><Kbd>Tab</Kbd> Focus traversal — owned by the browser for accessibility.</li>
            <li><Kbd>Ctrl</Kbd><Kbd>R</Kbd> / <Kbd>F5</Kbd> Reload — the browser eats these before Anchorworks sees them.</li>
            <li><Kbd>Ctrl</Kbd><Kbd>W</Kbd> / <Kbd>Ctrl</Kbd><Kbd>T</Kbd> — browser tab management.</li>
          </UL>
          <P>
            These appear in the dialog with a small lock icon and a tooltip
            explaining why they can't be rebound.
          </P>
        </>
      ),
    },

    // ------------- Platform (new category, Wave 12) -------------
    {
      id: 'pwa-offline',
      category: t('Platform'),
      title: 'PWA & offline mode',
      keywords: 'pwa progressive web app install offline service worker',
      body: () => (
        <>
          <P>
            Anchorworks is a <strong>Progressive Web App</strong> (Wave 12). After
            you visit it once, the browser caches the entire app shell — JavaScript,
            CSS, fonts, icons — via a service worker. Subsequent visits load
            instantly; airplane visits work at all.
          </P>
          <H>Installing</H>
          <P>
            In Chrome / Edge on desktop, look for an "Install" icon in the address
            bar (a tiny computer-with-arrow glyph). On mobile, the browser's share
            sheet has an <em>Add to Home Screen</em> option. Either path gives you a
            standalone window with no tab strip — Anchorworks feels like a native
            app, while still running in the same sandboxed browser context.
          </P>
          <H>Offline behaviour</H>
          <P>
            With network down, every local feature keeps working: drawing, editing,
            autosaves to local storage, project file open / save, SVG / PDF / G-code
            export. The only features that need the network are the AI assistant
            (it has to reach Anthropic) and any MCP servers you've configured.
          </P>
          <H>The offline banner</H>
          <P>
            When the browser reports <code>navigator.online === false</code>, a small
            chip — the <code>OfflineBanner</code> — appears at the top of the canvas
            stating <em>You're offline</em>. AI-related menu items show a muted state
            and a tooltip explaining why. The banner disappears automatically when
            connectivity returns; nothing else changes.
          </P>
          <H>Service worker updates</H>
          <P>
            When we ship a new version, the service worker downloads it in the
            background on your next visit. On a subsequent reload, Anchorworks
            swaps to the new version cleanly — the canvas state is preserved across
            the update because autosave persists to local storage first. There's no
            update banner to dismiss; the change is silent.
          </P>
        </>
      ),
    },
  ];
}

// Typed as LucideIcon (not the bare `{ size?: number }` shape it was before)
// so consumers can pass standard Lucide props like `aria-hidden`, `className`,
// `strokeWidth` etc. without TypeScript narrowing them away.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Getting started': Compass,
  'Tools': MousePointer2,
  'Drawing & paths': PenTool,
  'View': Eye,
  'Styling': Palette,
  'Text': Type,
  'Layers & layout': LayersIcon,
  'Assets': ImageIcon,
  'Templates': FileText,
  'AI assistant': Sparkles,
  'Plotter & cutter': Send,
  'Printing': Printer,
  'Save & restore': Save,
  'Preferences': Settings,
  'Platform': Cloud,
  'Keyboard shortcuts': Keyboard,
  'Accessibility': Accessibility,
};

export function HelpCenter() {
  const t = useT();
  const open = useEditor((s) => s.showHelpCenter);
  const setModal = useEditor((s) => s.setModal);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('welcome');
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const topics = useMemo(() => buildTopics(t), [t]);

  // Maintain a stable mapping from translated category back to the raw
  // English key so the icon lookup keeps working regardless of language.
  const categoryEnglish = useMemo(() => {
    const map = new Map<string, string>();
    map.set(t('Getting started'), 'Getting started');
    map.set(t('Tools'), 'Tools');
    map.set(t('Drawing & paths'), 'Drawing & paths');
    map.set(t('View'), 'View');
    map.set(t('Styling'), 'Styling');
    map.set(t('Text'), 'Text');
    map.set(t('Layers & layout'), 'Layers & layout');
    map.set(t('Assets'), 'Assets');
    map.set(t('Templates'), 'Templates');
    map.set(t('AI assistant'), 'AI assistant');
    map.set(t('Plotter & cutter'), 'Plotter & cutter');
    map.set(t('Printing'), 'Printing');
    map.set(t('Save & restore'), 'Save & restore');
    map.set(t('Preferences'), 'Preferences');
    map.set(t('Platform'), 'Platform');
    map.set(t('Keyboard shortcuts'), 'Keyboard shortcuts');
    map.set(t('Accessibility'), 'Accessibility');
    return map;
  }, [t]);

  // Fuzzy filter — substring match against title, category and keywords.
  // Cheap and predictable; we have ~50 topics, not 50,000.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((tp) => {
      const hay = `${tp.title} ${tp.category} ${tp.keywords ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [topics, query]);

  // Group filtered topics by category, preserving the order they appear
  // in the topic list (which is the order I authored them in).
  const grouped = useMemo(() => {
    const groups: { category: string; topics: Topic[] }[] = [];
    const seen = new Map<string, Topic[]>();
    for (const tp of filtered) {
      if (!seen.has(tp.category)) {
        const arr: Topic[] = [];
        seen.set(tp.category, arr);
        groups.push({ category: tp.category, topics: arr });
      }
      seen.get(tp.category)!.push(tp);
    }
    return groups;
  }, [filtered]);

  // If the active topic falls outside the filtered list, jump to the first
  // visible result so the body panel always reflects something the user sees
  // in the rail. Derive this in render to avoid the setState-in-effect cascade.
  const safeSelectedId =
    filtered.length && !filtered.find((tp) => tp.id === selectedId)
      ? filtered[0].id
      : selectedId;

  const selectedTopic = useMemo(
    () => topics.find((tp) => tp.id === safeSelectedId) ?? topics[0],
    [topics, safeSelectedId],
  );

  // When the dialog opens, focus the search input and reset to the welcome topic
  // on the first open (subsequent opens preserve where the user was).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Scroll the body back to the top whenever the active topic changes.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [safeSelectedId]);

  // Escape closes the dialog from anywhere — including when the search input
  // has focus (it would otherwise swallow Escape). Document-level listener so
  // we don't rely on bubble order from the input's own keydown.
  const close = useCallback(() => setModal('showHelpCenter', false), [setModal]);
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
    >
      <div
        className="w-[880px] max-w-[95vw] h-[70vh] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-accent2" aria-hidden="true" />
            <h2 id="help-center-title" className="dialog-title">{t('Help Center')}</h2>
          </div>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left rail */}
          <div className="w-[220px] shrink-0 border-r border-border bg-panel2/40 flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2 bg-panel border border-border rounded px-2 py-1">
                <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Search topics…')}
                  aria-label={t('Search topics…')}
                  className="flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {grouped.length === 0 ? (
                <div className="flex flex-col items-center text-center px-3 py-6">
                  {/* Open-book + question-mark — matches the other empty-state
                      illustrations (Layers / Assets / Symbols / Artboards). */}
                  <svg width="48" height="40" viewBox="0 0 48 40" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                    <path d="M6 8 L 23 8 L 24 32 L 6 32 Z" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeLinejoin="round" />
                    <path d="M42 8 L 25 8 L 24 32 L 42 32 Z" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeLinejoin="round" />
                    <path d="M30 16 a 3 3 0 1 1 4 2.5 L 33 22" stroke="rgb(var(--color-accent2))" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                    <circle cx="33" cy="26" r="0.9" fill="rgb(var(--color-accent))" />
                  </svg>
                  <div className="text-xs text-ink/90 mb-1">{t('No topics match')}</div>
                  <div className="type-caption leading-relaxed max-w-[180px]">
                    {t('Try a shorter or different keyword.')}
                  </div>
                </div>
              ) : (
                grouped.map((g) => {
                  const Icon = CATEGORY_ICONS[categoryEnglish.get(g.category) ?? ''] ?? Wand2;
                  return (
                    <div key={g.category} className="mb-3">
                      <h3 className="field-label flex items-center gap-1.5 px-3 font-semibold">
                        <Icon size={11} aria-hidden="true" />
                        <span>{g.category}</span>
                      </h3>
                      <div>
                        {g.topics.map((tp) => {
                          const active = tp.id === safeSelectedId;
                          return (
                            <button
                              key={tp.id}
                              type="button"
                              onClick={() => setSelectedId(tp.id)}
                              aria-current={active ? 'page' : undefined}
                              className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                                active
                                  ? 'bg-panel3 text-ink border-l-2 border-accent2 pl-[10px]'
                                  : 'text-ink/80 hover:bg-panel3/60 hover:text-ink'
                              }`}
                            >
                              {tp.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right body. tabIndex makes the scroll region keyboard-reachable
              (axe `scrollable-region-focusable`). */}
          <div
            ref={bodyRef}
            className="flex-1 overflow-y-auto"
            tabIndex={0}
            role="region"
            aria-label={t('Topic')}
          >
            <div className="px-7 py-6 max-w-[600px]">
              <div className="field-label">
                {selectedTopic.category}
              </div>
              <h2 className="type-display mb-4 leading-tight">
                {selectedTopic.title}
              </h2>
              <div className="space-y-3">{selectedTopic.body()}</div>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-border bg-panel2 text-[10px] text-muted flex items-center justify-between shrink-0">
          <span>
            {t('Press')} <Kbd>F1</Kbd> {t('anytime to open this dialog.')}
          </span>
          <span className="tabular-nums">{filtered.length} / {topics.length}</span>
        </div>
      </div>
    </div>
  );
}
