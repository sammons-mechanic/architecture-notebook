const STORAGE_KEY = 'arch:tree-open';

export const load_tree_open = (): Set<string> => {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  const parsed = JSON.parse(raw) as ReadonlyArray<string>;
  return new Set(parsed);
};

export const save_tree_open = (state: ReadonlySet<string>) => {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(Array.from(state)));
};
