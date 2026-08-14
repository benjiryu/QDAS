import { useId, useMemo } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { Command } from '../../config/keybindings';
import type { ShortcutsHelpApi } from './useShortcutsHelp';
import './shortcutsHelp.css';

/**
 * Every command, with the chord that runs it.
 *
 * Specification: decision D-057, which names this the canonical visible surface
 * for the command vocabulary, and D-065, which recorded that removing the
 * command strip left nothing else naming a command.
 *
 * **No chord is written here.** Every one is read from the binding table at
 * runtime through `describeChord`, so the help cannot drift from the keys that
 * actually work — which is the failure a hand-written cheat sheet always
 * eventually has, and the one that would matter most in a session.
 *
 * The labels are written here, because the table holds no human-readable names.
 * That is where the line falls: the words are the build's, the keys are the
 * table's.
 */

/** Where a chord applies, in the order a coder meets them. */
const GROUPS = [
  {
    title: 'In the transcript',
    commands: [
      { command: 'excerpt.code', label: 'Assign a code to the selected text' },
      { command: 'excerpt.note', label: 'Write a note about the selected text' },
      { command: 'excerpt.open', label: 'Reopen a saved excerpt to change its codes' },
      { command: 'note.open', label: 'Open the note on this speaker turn' },
      { command: 'excerpt.menu', label: 'Open the menu for the selected text' },
      { command: 'segment.speaker', label: 'Say who is speaking' },
      { command: 'segment.timestamp', label: 'Say the timestamp' },
      { command: 'position.report', label: 'Say where you are in the transcript' },
    ],
  },
  {
    title: 'In the code panel',
    commands: [
      { command: 'codes.focusSearch', label: 'Go to the search field' },
      { command: 'codes.codebook', label: 'Go to the codebook, and back again' },
      { command: 'codes.save', label: 'Save the codes and close' },
      { command: 'codes.close', label: 'Close, keeping the codes and note you chose' },
    ],
  },
  {
    title: 'In the note panel',
    commands: [
      // The same chord as the panel's close, and the same meaning: leaving
      // keeps your work. Listed under both because a coder looking for the way
      // out of the note should not have to know it is shared.
      { command: 'codes.close', label: 'Close, keeping what you wrote' },
    ],
  },
  {
    title: 'Anywhere',
    commands: [{ command: 'help.shortcuts', label: 'Show this list' }],
  },
] as const satisfies readonly {
  title: string;
  commands: readonly { command: Command; label: string }[];
}[];

export function ShortcutsHelp({ help }: { help: ShortcutsHelpApi }) {
  const headingId = useId();
  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  return (
    <ModalOverlay
      className="code-panel__overlay"
      isOpen={help.isOpen}
      onOpenChange={(open) => {
        if (!open) help.close();
      }}
      isDismissable
      /*
        Escape belongs to `useShortcutsHelp`, which asks `resolveEscape` who
        owns it. Letting React Aria also close on Escape would give one key two
        handlers racing, and only one of them knows the panel underneath must
        be left alone.
      */
      isKeyboardDismissDisabled
    >
      <Modal className="shortcuts-help__modal">
        <Dialog className="code-panel__surface" aria-labelledby={headingId}>
          <div className="code-panel shortcuts-help" data-region="shortcuts-help">
            <div className="code-panel__header">
              <h2 id={headingId} className="code-panel__heading">
                Keyboard shortcuts
              </h2>
              {/*
                No `data-command` here, unlike the panel's own close control.
                That attribute names the chord a control shares, and there is no
                `help.close` in the binding table — Escape reaches this through
                `resolveEscape`, which is not a command and has no row.
              */}
              <button type="button" className="code-panel__close" onClick={help.close}>
                <span aria-hidden="true">×</span>
                <span className="code-panel__close-label">Close</span>
              </button>
            </div>

            {/*
              Focusable, unlike the code panel's identical container. That one
              is full of checkboxes, so a keyboard user can already scroll it by
              moving through them; this one is text end to end, and a scrollable
              region with nothing tabbable inside it can only be read with a
              mouse. WCAG 2.1.1.
            */}
            <div className="code-panel__scroll" data-scroll-region tabIndex={0}>
              {GROUPS.map((group) => (
                <Group key={group.title} title={group.title}>
                  {group.commands.map(({ command, label }) => (
                    <li
                      key={`${group.title}-${command}`}
                      className="shortcuts-help__row"
                      /* So the completeness guard can ask which commands have a
                         row, rather than inferring it from chords — two
                         commands can share one chord in different contexts. */
                      data-command={command}
                    >
                      <span className="shortcuts-help__label">{label}</span>
                      {/* `kbd`, and in the accessibility tree: this is the
                          content, not decoration, unlike the chord shown beside
                          a control that does the same thing. */}
                      <kbd className="shortcuts-help__chord">
                        {describeChord(bindings[command], platform)}
                      </kbd>
                    </li>
                  ))}
                </Group>
              ))}
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * One group, as a named list.
 *
 * A list rather than a table, so a screen reader reports how many commands the
 * group holds on entry, and named by its own heading per D-051 — a rotor
 * landing on it arrives with no context otherwise.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const titleId = useId();

  return (
    <div className="code-panel__region">
      <h3 id={titleId}>{title}</h3>
      <ul className="shortcuts-help__list" aria-labelledby={titleId}>
        {children}
      </ul>
    </div>
  );
}
