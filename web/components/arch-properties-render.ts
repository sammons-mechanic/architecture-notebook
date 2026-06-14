import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { PropertyField } from '../lib/types.ts';

const ref_value_slug = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && '$ref' in value) {
    const inner = (value as { $ref: unknown }).$ref;
    return typeof inner === 'string' ? inner : null;
  }
  return null;
};

const render_ref = (slug: string, broken: boolean) => {
  const broken_attr = broken ? 'true' : nothing;
  return html`<arch-ref to=${slug} broken=${broken_attr}>${slug}</arch-ref>`;
};

const render_multi_ref = (value: unknown, broken_set: ReadonlySet<string>) => {
  if (!Array.isArray(value)) {
    return html`${String(value)}`;
  }
  return html`${value.map((item, index) => {
    const slug = ref_value_slug(item);
    return html`
      ${index > 0 ? html`<span>, </span>` : ''}
      ${slug === null ? html`${String(item)}` : render_ref(slug, broken_set.has(slug))}
    `;
  })}`;
};

const render_multi_string = (value: unknown) => {
  if (!Array.isArray(value)) {
    return html`${String(value)}`;
  }
  return html`${value.join(', ')}`;
};

const render_boolean = (value: unknown) => html`${value ? 'yes' : 'no'}`;

export const render_field = (field: PropertyField, value: unknown, broken_set: ReadonlySet<string>) => {
  if (field.type === 'ref') {
    const slug = ref_value_slug(value);
    if (slug === null) {
      return html`${String(value)}`;
    }
    return render_ref(slug, broken_set.has(slug));
  }
  if (field.type === 'multi-ref') {
    return render_multi_ref(value, broken_set);
  }
  if (field.type === 'multi-string') {
    return render_multi_string(value);
  }
  if (field.type === 'boolean') {
    return render_boolean(value);
  }
  if (field.type === 'rich') {
    return html`${unsafeHTML(String(value))}`;
  }
  return html`${String(value)}`;
};
