import type { Database } from './db.ts';
import type { NotebookVersion } from './lib/types.ts';

export const read_notebook_version = (db: Database): NotebookVersion => {
  const major = db.prepare("SELECT value FROM meta WHERE key = 'notebook_major'").get() as { value?: string } | undefined;
  const minor = db.prepare("SELECT value FROM meta WHERE key = 'notebook_minor'").get() as { value?: string } | undefined;
  return { major: Number(major?.value ?? '0'), minor: Number(minor?.value ?? '0') };
};

// +1 to the minor version. Call inside a content-mutating route's transaction
// so the version moves exactly when content commits — and exactly once per
// request (a batch bumps once, not once per op, because ops call repositories
// directly rather than these routes).
export const bump_notebook_minor = (db: Database): void => {
  db.prepare("UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'notebook_minor'").run();
};

// Human-controlled major bump (cut a milestone). Resets minor to 0, the
// standard major.minor reset.
export const set_notebook_major = (db: Database, major: number): void => {
  db.prepare("UPDATE meta SET value = ? WHERE key = 'notebook_major'").run(String(major));
  db.prepare("UPDATE meta SET value = '0' WHERE key = 'notebook_minor'").run();
};
