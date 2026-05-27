/**
 * Anchorworks brand mark.
 *
 * Concept: a thick bezier curve passing through a central filled anchor
 * point, with two diamond tangent handles on either side — the universal
 * vector-tool gesture compressed into a glyph. Reads simultaneously as:
 *   - An anchor point (bezier authoring metaphor)
 *   - The letter "A" (Anchorworks), since the two diamond handles and
 *     the central anchor form an implied triangular silhouette
 *   - A connecting line (workworks → handcrafted, joined-up)
 *
 * Three colours only:
 *   - accent  (#ff8a4c): central filled anchor square (the "page")
 *   - accent2 (#5ac8d8): tangent handles + bezier curve (the "tool")
 *   - app-bg          : hole in the diamond so it reads as a control handle
 *
 * Designed to read at 16px and 56px on dark + light backgrounds. No
 * gradients, no glow — the geometry does the work.
 */
interface LogoProps {
  /** Pixel size of the mark (square). Default 24. */
  size?: number;
  /** `mark` = glyph only · `full` = glyph + wordmark. */
  variant?: 'mark' | 'full';
  /** Optional class on the wrapping element. */
  className?: string;
}

export function Logo({ size = 24, variant = 'mark', className = '' }: LogoProps) {
  // The glyph lives on a 32-unit viewBox so stroke widths are predictable.
  const stroke = Math.max(1.5, size / 14);
  const diamond = Math.max(3, size / 7);    // tangent handle size
  const anchorSq = Math.max(5, size / 5);   // central anchor square

  const Mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      style={{ flex: 'none' }}
    >
      {/* Bezier curve passing through the central anchor — symmetric S
          shape with smooth tangents pointing toward the two diamond
          handles. Reads as the "live path" the user is shaping. */}
      <path
        d="M5 23 C 11 23, 11 9, 16 9 C 21 9, 21 23, 27 23"
        stroke="rgb(var(--color-accent2))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.75}
      />
      {/* Faint tangent lines from each diamond to the central anchor —
          the visual "I am a tangent handle" connection a vector user
          recognises immediately. */}
      <line
        x1="5" y1="23" x2="16" y2="16"
        stroke="rgb(var(--color-accent2))"
        strokeOpacity={0.35}
        strokeWidth={stroke * 0.5}
        strokeLinecap="round"
      />
      <line
        x1="27" y1="23" x2="16" y2="16"
        stroke="rgb(var(--color-accent2))"
        strokeOpacity={0.35}
        strokeWidth={stroke * 0.5}
        strokeLinecap="round"
      />
      {/* Left diamond — hollow tangent handle (industry convention:
          unselected handle = outline only). */}
      <rect
        x={5 - diamond / 2}
        y={23 - diamond / 2}
        width={diamond}
        height={diamond}
        transform={`rotate(45 5 23)`}
        fill="rgb(var(--color-app-bg))"
        stroke="rgb(var(--color-accent2))"
        strokeWidth={Math.max(1, stroke * 0.7)}
      />
      {/* Right diamond — filled tangent handle (selected). The asymmetry
          adds movement: the eye reads the right side as "active". */}
      <rect
        x={27 - diamond / 2}
        y={23 - diamond / 2}
        width={diamond}
        height={diamond}
        transform={`rotate(45 27 23)`}
        fill="rgb(var(--color-accent2))"
      />
      {/* Central anchor — filled square in brand orange. The smallest
          rotation (5°) breaks the rigid grid and gives the mark a
          slight "drawn by hand" quality without looking accidental. */}
      <rect
        x={16 - anchorSq / 2}
        y={16 - anchorSq / 2}
        width={anchorSq}
        height={anchorSq}
        rx="0.8"
        transform="rotate(5 16 16)"
        fill="rgb(var(--color-accent))"
      />
    </svg>
  );

  if (variant === 'mark') {
    return <span className={className} style={{ display: 'inline-flex' }}>{Mark}</span>;
  }

  // Wordmark sizing follows the glyph so the pair holds together at any scale.
  const wordSize = Math.max(11, Math.round(size * 0.62));
  const gap = Math.max(6, Math.round(size * 0.35));

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap }}
    >
      {Mark}
      <span
        style={{
          fontSize: wordSize,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'rgb(var(--color-ink))',
          lineHeight: 1,
        }}
      >
        Anchor<span style={{ color: 'rgb(var(--color-muted))', fontWeight: 500 }}>works</span>
      </span>
    </span>
  );
}
