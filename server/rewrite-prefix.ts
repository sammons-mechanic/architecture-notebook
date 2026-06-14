// Surgical rewrite of API paths inside JSON responses for per-notebook requests.
// Only touches known fields (href, hint, instance, schema_ref) and the Location header
// to avoid mangling user-authored HTML that happens to contain "/api/" substrings.

const PATH_RE = /("(?:href|hint|instance|schema_ref)"\s*:\s*")(\/(?:api(?:\b|\/)|print(?:\b|\/)))/g;

export const rewrite_paths_in_json = (body: string, prefix: string): string => {
  if (!body || !body.includes('/api') && !body.includes('/print')) return body;
  return body.replace(PATH_RE, (_match, key_part: string, path_start: string) => `${key_part}${prefix}${path_start}`);
};

export const rewrite_location = (location: string | undefined, prefix: string): string | undefined => {
  if (!location) return location;
  if (location.startsWith('/api/') || location === '/api' || location.startsWith('/print') || location === '/print') {
    return `${prefix}${location}`;
  }
  return location;
};
