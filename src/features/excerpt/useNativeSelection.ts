import { useCallback, useEffect, useState } from 'react';
import type { ResolvedSource } from '../../domain';
import {
  clearNativeSelection,
  readAdoptableSelection,
  selectionCollapsedInside,
} from './nativeSelection';
import type { AdoptableSelection } from './nativeSelection';

/**
 * Watches the document selection while the transcript is on screen.
 *
 * Specification: docs/patterns/excerpt-selection.md section 4.0, decision D-034.
 *
 * Governed by `adoptNativeSelection`. With the flag off no listener is attached
 * at all, so the comparative session runs with the command route and nothing
 * else, rather than with observation quietly still happening underneath.
 */

export interface NativeSelectionApi {
  /** The current selection as a snapped range, or null when there is none. */
  adoptable: AdoptableSelection | null;
  /** Called at the moment of adoption. */
  clear: () => void;
}

interface Options {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  resolved: ResolvedSource;
}

export function useNativeSelection({
  enabled,
  containerRef,
  resolved,
}: Options): NativeSelectionApi {
  const [adoptable, setAdoptable] = useState<AdoptableSelection | null>(null);

  const read = useCallback(() => {
    const container = containerRef.current;
    const next = readAdoptableSelection(container, resolved);

    // A selection to adopt always replaces whatever was held.
    if (next) {
      setAdoptable(next);
      return;
    }

    // Nothing to adopt now. Forget the held selection only when the collapse
    // happened inside the transcript, which is the user clicking or dragging
    // again. Pressing a control clears the selection as a side effect, and the
    // drag has to survive that or it can never be adopted by the control the
    // user pressed to adopt it.
    if (selectionCollapsedInside(container)) setAdoptable(null);
  }, [containerRef, resolved]);

  useEffect(() => {
    if (!enabled) return;

    // `selectionchange` on the document is the only event that reports a drag
    // in progress and a selection cleared by a click alike. Nothing here
    // cancels or interferes with the selection itself.
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, [enabled, read]);

  const clear = useCallback(() => {
    clearNativeSelection();
    setAdoptable(null);
  }, []);

  return { adoptable: enabled ? adoptable : null, clear };
}
