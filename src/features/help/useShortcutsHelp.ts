import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { bindingsFor, commandFor, detectPlatform, resolveEscape } from '../../config/keybindings';
import {
  isShortcutsHelpOpen,
  setShortcutsHelpOpen,
  subscribeToShortcutsHelp,
} from './shortcutsHelpStore';

/**
 * The shortcuts help: its chord, its open state, and its focus return.
 *
 * Specification: decision D-057, which makes this "the canonical visible
 * surface for the command vocabulary", and D-065, which recorded the gate this
 * closes — removing the command strip left nothing on screen naming a command.
 *
 * Mounted once, in the shell, so the chord answers on every route. The commands
 * it documents belong to the transcript and its panels, but a coder stuck on
 * the Codebook page is exactly the person who needs to ask.
 */

export interface ShortcutsHelpApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function useShortcutsHelp(): ShortcutsHelpApi {
  const isOpen = useSyncExternalStore(
    subscribeToShortcutsHelp,
    isShortcutsHelpOpen,
    isShortcutsHelpOpen,
  );

  /** Where focus was before the dialog took it. Contract 2.4. */
  const returnTo = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShortcutsHelpOpen(true);
  }, []);

  const close = useCallback(() => {
    setShortcutsHelpOpen(false);

    /*
      Back where it came from, after the dialog has finished unwinding its own
      focus handling — the same ordering the context menu and the panels need.
      A help dialog that dismissed to nowhere would leave a screen reader user
      at the top of the document, having asked a question and lost their place.
    */
    const target = returnTo.current;
    returnTo.current = null;
    queueMicrotask(() => {
      if (target?.isConnected) target.focus?.();
    });
  }, []);

  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      /*
        Escape first, and only when this layer owns it. `resolveEscape` is where
        that is decided; asking it here rather than branching on the key is what
        keeps one module responsible for what Escape means.

        Closing the help commits and discards nothing beneath it — the code
        panel keeps its pending codes and its note, and the next Escape reaches
        it. A stack, not a swallow.
      */
      if (event.key === 'Escape') {
        if (resolveEscape({ helpOpen: isShortcutsHelpOpen(), panelOpen: false }) !== 'help') return;
        event.preventDefault();
        /*
          Immediate, not ordinary, propagation. The code panel's handler is on
          `document` too, and `stopPropagation` does not stop listeners already
          attached to the same node — so the panel would still see this Escape,
          read a store that `close` had just set to false, and close itself.

          That leaves an ordering requirement: this listener has to be attached
          before the panel's. It is, because the shell mounts before any panel
          it contains, and the test that codes and takes the help above an open
          panel fails loudly if that ever stops being true.
        */
        event.stopImmediatePropagation();
        close();
        return;
      }

      if (commandFor(event, bindings) !== 'help.shortcuts') return;
      event.preventDefault();
      // Opening while open is a no-op rather than a re-open, so the chord does
      // not lose the focus-return target by overwriting it with the dialog.
      if (!isShortcutsHelpOpen()) open();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bindings, close, open]);

  return { isOpen, open, close };
}
