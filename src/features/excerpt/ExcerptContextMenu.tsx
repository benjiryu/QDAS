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
        placement="bottom start"
        className="excerpt-menu__popover"
      >
        <Menu
          className="excerpt-menu"
          aria-label="Selection"
          // Focus enters on the first item, per contract 2.4.
          autoFocus="first"
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
