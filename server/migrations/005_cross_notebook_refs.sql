-- Migration 005: cross-notebook refs.
-- Relax refs.to_id to nullable so cross-refs can carry (to_notebook, to_slug)
-- instead. Add a CHECK enforcing exactly-one-of (local vs cross). Replace
-- the single UNIQUE constraint with two partial unique indexes so the
-- existing uniqueness invariant holds for local refs and a parallel
-- invariant holds for cross-refs.

CREATE TABLE refs_new (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  to_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  to_notebook TEXT,
  to_slug TEXT,
  role TEXT,
  source TEXT NOT NULL DEFAULT 'html',
  payload_json TEXT,
  etag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (to_id IS NOT NULL AND to_notebook IS NULL AND to_slug IS NULL)
    OR (to_id IS NULL AND to_notebook IS NOT NULL AND to_slug IS NOT NULL)
  )
);

INSERT INTO refs_new (id, from_id, to_id, role, source, payload_json, etag, created_at)
  SELECT id, from_id, to_id, role, source, payload_json, etag, created_at FROM refs;

DROP TABLE refs;
ALTER TABLE refs_new RENAME TO refs;

CREATE INDEX refs_from ON refs(from_id);
CREATE INDEX refs_to ON refs(to_id);
CREATE INDEX refs_to_cross ON refs(to_notebook, to_slug) WHERE to_notebook IS NOT NULL;
CREATE UNIQUE INDEX refs_unique_local ON refs(from_id, to_id, role, source) WHERE to_id IS NOT NULL;
CREATE UNIQUE INDEX refs_unique_cross ON refs(from_id, to_notebook, to_slug, role, source) WHERE to_id IS NULL;
