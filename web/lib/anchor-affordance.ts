import { commentsAnchorFilter, commentsFilter } from './comments-store.ts';
import { open_comments_rail } from '../nav-rail.ts';

const button_class = 'anchor-affordance';

const make_button = (anchor: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = button_class;
  button.textContent = '+';
  button.title = `Comment on ${anchor}`;
  button.setAttribute('aria-label', `Comment on paragraph ${anchor}`);
  button.dataset.anchorTarget = anchor;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    commentsAnchorFilter.set(anchor);
    commentsFilter.set('all');
    open_comments_rail();
  });
  return button;
};

const ensure_relative = (target: HTMLElement) => {
  const computed = getComputedStyle(target).position;
  if (computed === 'static') {
    target.style.position = 'relative';
  }
};

export const attach_anchor_affordances = (root: HTMLElement) => {
  const targets = root.querySelectorAll<HTMLElement>('[data-anchor]');
  for (const target of targets) {
    if (target.dataset.affordanceReady === '1') continue;
    target.dataset.affordanceReady = '1';
    ensure_relative(target);
    const anchor = target.dataset.anchor ?? '';
    if (!anchor) continue;
    const button = make_button(anchor);
    target.appendChild(button);
  }
};
