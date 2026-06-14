import { nav_to_section } from '../nav.ts';
import { treeOpenState } from '../store-signals.ts';
import type { TreeNode } from '../lib/tree-utils.ts';

const all_visible_rows = (): ReadonlyArray<HTMLElement> => {
  const root = document.querySelector('arch-tree');
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
};

const move_focus = (current: HTMLElement, delta: number) => {
  const rows = all_visible_rows();
  const index = rows.indexOf(current);
  if (index === -1) {
    return;
  }
  const next_index = Math.max(0, Math.min(rows.length - 1, index + delta));
  rows[next_index]?.focus();
};

const focus_end = (start: HTMLElement, which: 'first' | 'last') => {
  const rows = all_visible_rows();
  if (rows.length === 0) {
    return;
  }
  if (which === 'first') {
    rows[0].focus();
  } else {
    rows[rows.length - 1].focus();
  }
};

export const tree_keydown = (
  event: KeyboardEvent,
  host: HTMLElement,
  node: TreeNode,
  toggle: (slug: string) => void,
) => {
  const row = host.querySelector<HTMLElement>(':scope > li > .row');
  if (!row) {
    return;
  }
  const has_kids = node.children.length > 0;
  const open_set = treeOpenState.get();
  const expanded = open_set.has(node.slug);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move_focus(row, 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move_focus(row, -1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (has_kids && !expanded) {
      toggle(node.slug);
    } else if (has_kids && expanded) {
      move_focus(row, 1);
    }
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (has_kids && expanded) {
      toggle(node.slug);
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    nav_to_section(node.slug);
  } else if (event.key === 'Home') {
    event.preventDefault();
    focus_end(row, 'first');
  } else if (event.key === 'End') {
    event.preventDefault();
    focus_end(row, 'last');
  }
};
