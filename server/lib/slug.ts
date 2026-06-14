import { make_failure, type Failure } from './failure.ts';

export const slug_pattern = /^[a-z0-9-]+$/;
// Notebook-unit cross-reference: `@<notebook-slug>` with NO slash + section
// part. The shipped @notebook/section form is rejected. Notebook slug
// requires a leading alphanumeric (stricter than the unqualified slug
// regex) so edge cases like `@-foo` parse cleanly.
export const notebook_ref_pattern = /^@[a-z0-9][a-z0-9-]*$/;

export type ParsedNotebookRef = { readonly notebook: string };

export const parse_notebook_ref = (value: string): ParsedNotebookRef | null => {
  if (!notebook_ref_pattern.test(value)) return null;
  return { notebook: value.slice(1) };
};

export const is_valid_slug = (slug: string): boolean => slug_pattern.test(slug);
export const is_valid_ref_target = (value: string): boolean =>
  slug_pattern.test(value) || notebook_ref_pattern.test(value);

export const normalize_slug = (input: string): string | Failure => {
  if (typeof input !== 'string' || input.length === 0) {
    return make_failure('slug-invalid', 'Slug must be a non-empty string');
  }
  if (!slug_pattern.test(input)) {
    return make_failure('slug-invalid', `Slug ${JSON.stringify(input)} must match ^[a-z0-9-]+$`);
  }
  return input;
};

export const slug_from_title = (title: string): string => {
  const lowered = title.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-');
  const trimmed = replaced.replace(/^-+|-+$/g, '');
  return trimmed.length === 0 ? 'untitled' : trimmed;
};

export const next_unique_slug = (
  base: string,
  exists: (candidate: string) => boolean
): string => {
  if (!exists(base)) {
    return base;
  }
  let suffix = 2;
  while (exists(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
};
