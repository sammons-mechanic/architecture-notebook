import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { commentsPanelOpen } from '../store-signals.ts';
import { close_all_rails } from '../nav-rail.ts';
import {
  commentsList, commentsTotal, commentsLoading, commentsFilter, commentsAnchorFilter,
  load_comments, create_comment, patch_comment, delete_comment, reset_comments,
  type Comment, type CommentsFilter,
} from '../lib/comments-store.ts';
import { comment_item_template, get_comments_link, scroll_to_anchor } from './arch-comments-body.ts';

class ArchComments extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  #last_loaded_key: string | null = null;
  #draft = '';

  #refresh = async () => {
    const link = get_comments_link();
    if (!link) return;
    await load_comments(link, commentsFilter.get(), commentsAnchorFilter.get());
  };

  #on_filter = (filter: CommentsFilter) => {
    commentsFilter.set(filter);
    void this.#refresh();
  };

  #clear_anchor = () => {
    commentsAnchorFilter.set(null);
    void this.#refresh();
  };

  #on_input = (event: Event) => {
    this.#draft = (event.target as HTMLTextAreaElement).value;
    this.requestUpdate();
  };

  #on_submit = async () => {
    const link = get_comments_link();
    const body = this.#draft.trim();
    if (!link || body.length === 0) return;
    const ok = await create_comment(link, body, commentsAnchorFilter.get());
    if (!ok) return;
    this.#draft = '';
    const textarea = this.querySelector<HTMLTextAreaElement>('.comments-add textarea');
    if (textarea) textarea.value = '';
    await this.#refresh();
  };

  #on_toggle = async (item: Comment) => {
    const ok = await patch_comment(item, { resolved: !item.resolved });
    if (!ok) return;
    await this.#refresh();
  };

  #on_delete = async (item: Comment) => {
    if (!confirm('Delete this comment?')) return;
    const ok = await delete_comment(item);
    if (!ok) return;
    await this.#refresh();
  };

  updated() {
    if (!commentsPanelOpen.get()) {
      if (this.#last_loaded_key) {
        this.#last_loaded_key = null;
        reset_comments();
      }
      return;
    }
    const link = get_comments_link();
    if (!link) return;
    const anchor = commentsAnchorFilter.get();
    const key = `${link.href}|${commentsFilter.get()}|${anchor ?? ''}`;
    if (key !== this.#last_loaded_key) {
      this.#last_loaded_key = key;
      void load_comments(link, commentsFilter.get(), anchor);
      const textarea = this.querySelector<HTMLTextAreaElement>('.comments-add textarea');
      if (textarea && document.activeElement !== textarea) {
        textarea.focus();
      }
    }
  }

  render() {
    if (!commentsPanelOpen.get()) {
      return html``;
    }
    const filter = commentsFilter.get();
    const total = commentsTotal.get();
    const items = commentsList.get();
    const loading = commentsLoading.get();
    const anchor = commentsAnchorFilter.get();
    const submit_disabled = this.#draft.trim().length === 0;
    return html`
      <aside class="comments-rail" role="dialog" aria-label="Comments panel">
        <div class="comments-head">
          <span class="comments-head-label">Comments<span class="comments-head-count">${total}</span></span>
          <button class="comments-close" title="close" @click=${close_all_rails}>✕</button>
        </div>
        <div class="comments-filter">
          <button class=${filter === 'open' ? 'active' : ''} @click=${() => this.#on_filter('open')}>Open</button>
          <button class=${filter === 'all' ? 'active' : ''} @click=${() => this.#on_filter('all')}>All</button>
        </div>
        ${anchor ? html`
          <div class="comments-anchor-pill" title="filtered to a single paragraph">
            <span class="comments-anchor-pill-label">filtered:</span>
            <span class="comments-anchor-pill-value">${anchor}</span>
            <button type="button" class="comments-anchor-pill-clear" @click=${this.#clear_anchor} aria-label="clear paragraph filter">×</button>
          </div>` : ''}
        <form class="comments-add" @submit=${(event: Event) => { event.preventDefault(); void this.#on_submit(); }}>
          <textarea
            placeholder=${anchor ? `Comment on ${anchor}…` : 'Add a comment in markdown…'}
            rows="3"
            @input=${this.#on_input}
          ></textarea>
          <button type="submit" ?disabled=${submit_disabled}>Post</button>
        </form>
        ${loading && items.length === 0 ? html`<div class="comments-loading">loading…</div>` : ''}
        ${!loading && items.length === 0 ? html`<div class="comments-empty">no comments to show</div>` : ''}
        <ul class="comments-list">
          ${items.map((comment) => comment_item_template(comment, {
            on_toggle: this.#on_toggle,
            on_delete: this.#on_delete,
            on_anchor: scroll_to_anchor,
          }))}
        </ul>
      </aside>
    `;
  }
}

customElements.define('arch-comments', ArchComments);
