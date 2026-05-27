/**
 * Date / time helpers.
 *
 * Single source for the editor's fixed-format timestamps. `formatHMS` is
 * the local-time `HH:MM:SS` formatter the DebugPanel log rows and the
 * InspectPanel "last refreshed at" stamp both want — locale-independent,
 * zero-padded for tabular alignment, no AM/PM suffix.
 */

/** Format a Unix-ms timestamp as zero-padded local `HH:MM:SS`. */
export function formatHMS(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
