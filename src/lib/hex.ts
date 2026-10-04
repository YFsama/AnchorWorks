/** Bytes → space-separated lowercase hex string — shared by the Epson maintenance workbench and the plotter serial link. */
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
}
