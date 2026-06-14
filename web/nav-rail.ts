import { glimpseStack, glimpseCursor, revisionsPanelOpen, commentsPanelOpen } from './store-signals.ts';

export const close_all_rails = () => {
  glimpseStack.set([]);
  glimpseCursor.set(-1);
  revisionsPanelOpen.set(false);
  commentsPanelOpen.set(false);
};

export const open_revisions_rail = () => {
  glimpseStack.set([]);
  glimpseCursor.set(-1);
  commentsPanelOpen.set(false);
  revisionsPanelOpen.set(true);
};

export const open_comments_rail = () => {
  glimpseStack.set([]);
  glimpseCursor.set(-1);
  revisionsPanelOpen.set(false);
  commentsPanelOpen.set(true);
};
