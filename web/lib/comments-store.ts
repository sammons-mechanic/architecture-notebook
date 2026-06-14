import { signal } from '@lit-labs/signals';
import { hal_fetch } from './hal-fetch.ts';
import { error } from '../store-signals.ts';
import type { HalLink, HalLinks } from './types.ts';

export type Comment = {
  readonly id: number;
  readonly section_slug: string;
  readonly anchor: string;
  readonly body: string;
  readonly author: string | null;
  readonly resolved: boolean;
  readonly created_at: number;
  readonly updated_at: number;
  readonly _etag: string;
  readonly _links: HalLinks;
};

type CommentList = { readonly total: number; readonly _embedded?: { readonly items: ReadonlyArray<Comment> } };

export type CommentsFilter = 'open' | 'all';

export const commentsList = signal<ReadonlyArray<Comment>>([]);
export const commentsTotal = signal<number>(0);
export const commentsLoading = signal<boolean>(false);
export const commentsFilter = signal<CommentsFilter>('open');
export const commentsAnchorFilter = signal<string | null>(null);

export const load_comments = async (base: HalLink, filter: CommentsFilter, anchor: string | null = null) => {
  const parts: string[] = [];
  if (filter === 'open') parts.push('resolved=false');
  if (anchor !== null) parts.push(`anchor=${encodeURIComponent(anchor)}`);
  const link: HalLink = parts.length === 0
    ? base
    : { href: `${base.href}${base.href.includes('?') ? '&' : '?'}${parts.join('&')}` };
  commentsLoading.set(true);
  const response = await hal_fetch<CommentList>(link);
  commentsLoading.set(false);
  if (!response.ok) {
    error.set(response.problem);
    return;
  }
  commentsList.set(response.body._embedded?.items ?? []);
  commentsTotal.set(response.body.total);
};

export const create_comment = async (base: HalLink, body: string, anchor: string | null = null) => {
  const payload: Record<string, unknown> = { body };
  if (anchor !== null) payload.anchor = anchor;
  const response = await hal_fetch<Comment>(base, {
    method: 'POST',
    body: payload,
    idempotency_key: crypto.randomUUID(),
  });
  if (!response.ok) {
    error.set(response.problem);
    return false;
  }
  return true;
};

export const patch_comment = async (comment: Comment, patch: { readonly resolved?: boolean; readonly body?: string }) => {
  const link = comment._links.self;
  if (!link) return false;
  const response = await hal_fetch<Comment>(link, {
    method: 'PATCH',
    body: patch,
    if_match: comment._etag,
    idempotency_key: crypto.randomUUID(),
  });
  if (!response.ok) {
    error.set(response.problem);
    return false;
  }
  return true;
};

export const delete_comment = async (comment: Comment) => {
  const link = comment._links.self;
  if (!link) return false;
  const response = await hal_fetch<null>(link, {
    method: 'DELETE',
    if_match: comment._etag,
    idempotency_key: crypto.randomUUID(),
  });
  if (!response.ok) {
    error.set(response.problem);
    return false;
  }
  return true;
};

export const reset_comments = () => {
  commentsList.set([]);
  commentsTotal.set(0);
  commentsFilter.set('open');
  commentsAnchorFilter.set(null);
};
