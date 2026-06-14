export const slug_from_title = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
};

export const is_valid_slug = (slug: string): boolean => /^[a-z0-9-]+$/.test(slug) && slug.length > 0;
