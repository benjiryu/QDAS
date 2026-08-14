import { useMemo, useRef } from 'react';
import { Menu, MenuItem, Popover } from 'react-aria-components';
import { bindingsFor, describeChord, detectPlatform } from '../../config/keybindings';
import type { ExcerptSelectionApi } from './useExcerptSelection';
import './excerptMenu.css';

/**
 * The transcript context menu.
 *
 * Specification: docs/patterns/excerpt-selection.md section 2, decision D-037.
 *
 * React Aria rather than hand-rolled markup, per the technical rules: a menu is
 * one of the few genuinely complex standard controls, and its roving tabindex,
 * typeahead, arrow wrapping, and dismiss behaviour are exactly the things a
 * hand-rolled version gets subtly wrong on one screen reader out of three.
 *
 * The menu adds no capability. Both items exist on the strip and as chords, per
 * D-028's conditions carried forward by D-037, and each shows the chord that
 * does the same thing without opening a menu at all.
 */

const ITEMS = [
  { target: 'search', label: 'Assign code', command: 'excerpt.code' },
  { target: 'note', label: 'Add note', command: 'excerpt.note' },
] as const;

interface ExcerptContextMenuProps {
  excerpt: ExcerptSelectionApi;
}

export function ExcerptContextMenu({ excerpt }: ExcerptContextMenuProps) {
  const platform = useMemo(() => detectPlatform(), []);
  const bindings = useMemo(() => bindingsFor(platform), [platform]);

  const { menu } = excerpt;
  /*
   * A zero-sized element at the pointer, because there is no trigger button to
   * anchor to: the gesture that opens this menu happens over prose. It is
   * `aria-hidden` and not focusable, so it exists only for positioning.
   */
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  return (
    <>
      <span
        ref={anchorRef}
        className="excerpt-menu__anchor"
        style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
        aria-hidden="true"
      />
      <Popover
        triggerRef={anchorRef}
        isOpen={menu.isOpen}
        // Covers Escape, a click outside, and a scroll away. All three mean the
        // same thing here: the menu is done and focus goes back where it was.
        onOpenChange={(isOpen) => {
          if (!isOpen) menu.close();
        }}
        /*
          Non-modal, and this is what actually fixes the reported bug.

          React Aria's default treatment puts `inert` on the rest of the
          document while the popover is open. Inert content is not selectable
          and its selection is neither painted nor reported — with the menu
          open, `getSelection().toString()` came back empty even though the
          range was still there. That, measured, is why the highlight vanished:
          not the inactive repaint D-060 names, which is a real effect but a
          later one. An authored `::selection` cannot paint inside an inert
          subtree, so the stylesheet alone would not have fixed this.

          A menu is not a dialog, so not hiding the document behind it is also
          the more correct treatment. Focus still enters the menu and arrow
          navigation is unchanged; only the background's inertness goes.
        */
        isNonModal
        placement="bottom start"
        className="excerpt-menu__popover"
      >
        <Menu
          className="excerpt-menu"
          aria-label="Selection"
          // Focus enters on the first item, per contract 2.4.
          autoFocus="first"
          /*
            A mousedown collapses the document selection before any click
            handler runs, and this menu exists to act on that selection. The
            strip's controls carry the same guard for the same reason. Per
            D-060 no path through this menu alters the DOM selection.
          */
          onMouseDown={(event) => event.preventDefault()}
          onAction={(key) => menu.choose(key === 'note' ? 'note' : 'search')}
        >
          {ITEMS.map((item) => (
            <MenuItem key={item.target} id={item.target} className="excerpt-menu__item">
              {item.label}
              {/* The same chord the strip shows, so the menu teaches the way
                  that does not need the menu. */}
              <kbd className="excerpt-menu__chord" aria-hidden="true">
                {describeChord(bindings[item.command], platform)}
              </kbd>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </>
  );
}
