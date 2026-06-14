import { signal } from '@lit-labs/signals';
import { hal_fetch } from './hal-fetch.ts';
import type { Section } from './types.ts';

export const glimpseSection = signal<Section | null>(null);
export const glimpseLoadingSlug = signal<string | null>(null);

const cache = new Map<string, Section>();

export const load_glimpse = async (sections_base_href: string, slug: string) => {
  if (cache.has(slug)) {
    glimpseSection.set(cache.get(slug)!);
    return;
  }
  glimpseLoadingSlug.set(slug);
  const href = `${sections_base_href}/${encodeURIComponent(slug)}?embed=type`;
  const response = await hal_fetch<Section>({ href });
  if (response.ok) {
    cache.set(slug, response.body);
    glimpseSection.set(response.body);
  } else {
    glimpseSection.set(null);
  }
  glimpseLoadingSlug.set(null);
};

export const clear_glimpse = () => {
  glimpseSection.set(null);
};
