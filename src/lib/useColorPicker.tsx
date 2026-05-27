/**
 * Hook for the advanced color picker popover — extracted from
 * `ColorPickerPopover.tsx` so that component file is a pure component module
 * (Fast Refresh-friendly).
 *
 * Usage:
 *   const { open, close, popover } = useColorPickerPopover();
 *   // render `popover` anywhere — it's null when closed.
 *   <button onClick={() => open({ value: '#abc', onChange: (hex) => ... })} />
 */

import { useCallback, useState } from 'react';
import { ColorPickerPopover } from '../components/ColorPickerPopover';

interface OpenOptions {
  value: string;
  anchor?: { x: number; y: number };
  onChange: (hex: string) => void;
}

export function useColorPickerPopover() {
  const [state, setState] = useState<null | {
    value: string;
    anchor: { x: number; y: number } | null;
    onChange: (hex: string) => void;
  }>(null);

  const open = useCallback((opts: OpenOptions) => {
    setState({ value: opts.value, anchor: opts.anchor ?? null, onChange: opts.onChange });
  }, []);

  const close = useCallback(() => setState(null), []);

  const popover = state ? (
    <ColorPickerPopover
      value={state.value}
      anchor={state.anchor}
      onChange={(hex) => {
        state.onChange(hex);
        setState((s) => (s ? { ...s, value: hex } : s));
      }}
      onClose={close}
    />
  ) : null;

  return { open, close, popover };
}
