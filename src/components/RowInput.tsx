import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { useRowInputId } from '../lib/rowInputIdContext';

/** Drop-in `<input>` replacement that auto-applies the id provided by
 *  the surrounding `<Row>` via `RowInputIdContext`. An explicit `id`
 *  prop on the call site wins so consumers that need a stable custom id
 *  can still override. */
export const RowInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function RowInput(props, ref) {
    const ctxId = useRowInputId();
    const id = props.id ?? ctxId ?? undefined;
    return <input ref={ref} {...props} id={id} />;
  },
);

export const RowSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function RowSelect(props, ref) {
    const ctxId = useRowInputId();
    const id = props.id ?? ctxId ?? undefined;
    return <select ref={ref} {...props} id={id} />;
  },
);
