import { createContext, useContext } from 'react';

/**
 * Bridge between `PropertiesPanel#Row` and the input controls it wraps.
 *
 * `Row` generates an id via `useId()`, sets it as the `<label>`'s
 * `htmlFor`, and provides it through this context. Input components
 * inside the row opt in by calling `useRowInputId()` (or by using the
 * `RowInput` / `RowSelect` thin wrappers in `components/RowInput.tsx`)
 * and applying the id to their primary `<input>` / `<select>` /
 * `<textarea>`.
 *
 * Lives in `lib/` (not `components/`) so it can be imported by both the
 * Provider-side (`PropertiesPanel.tsx`) and the consumer-side
 * (`components/RowInput.tsx`) without forming a components/non-components
 * mix that breaks react-refresh's HMR.
 */
export const RowInputIdContext = createContext<string | null>(null);

export function useRowInputId(): string | null {
  return useContext(RowInputIdContext);
}
