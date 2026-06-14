import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { render_markdown } from '../lib/md.ts';
import { currentSection } from '../store-signals.ts';
import type { Comment } from '../lib/comments-store.ts';
import type { HalLink } from '../lib/types.ts';

type SectionWithComments = { readonly _links?: { readonly comments?: HalLink } };

export const get_comments_link = (): HalLink | null => {
  const section = currentSection.get();
  return (section as unknown as SectionWithComments | null)?._links?.comments ?? null;
};

const time_label = (epoch_seconds: number) => {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - epoch_seconds;
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)}d ago`;
  return new Date(epoch_seconds * 1000).toISOString().slice(0, 10);
};

export type CommentActions = {
  readonly on_toggle: (comment: Comment) => void;
  readonly on_delete: (comment: Comment) => void;
  readonly on_anchor?: (anchor: string) => void;
};

export const scroll_to_anchor = (anchor: string) => {
  if (anchor === 'section') {
    const main = document.querySelector('arch-section-view .read');
    if (main) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const target = document.querySelector<HTMLElement>(`arch-section-view [data-anchor="${anchor}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

export const comment_item_template = (comment: Comment, actions: CommentActions) => {
  const author = comment.author ?? 'unknown';
  const klass = comment.resolved ? 'comment-item resolved' : 'comment-item';
  const toggle_label = comment.resolved ? 'Reopen' : 'Resolve';
  const anchor_clickable = comment.anchor !== 'section' && actions.on_anchor !== undefined;
  const anchor_class = anchor_clickable ? 'comment-anchor clickable' : 'comment-anchor';
  return html`
    <li class=${klass}>
      <header class="comment-head">
        <span class="comment-author">${author}</span>
        <span class="comment-time">${time_label(comment.created_at)}</span>
        <span class=${anchor_class}
          @click=${anchor_clickable ? () => actions.on_anchor!(comment.anchor) : undefined}
        >${comment.anchor}</span>
        ${comment.resolved ? html`<span class="comment-badge">resolved</span>` : ''}
      </header>
      <div class="comment-body">${unsafeHTML(render_markdown(comment.body))}</div>
      <div class="comment-actions">
        <button type="button" @click=${() => actions.on_toggle(comment)}>${toggle_label}</button>
        <button type="button" class="comment-delete" @click=${() => actions.on_delete(comment)}>Delete</button>
      </div>
    </li>
  `;
};
