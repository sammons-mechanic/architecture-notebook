-- Migration 006: collapse cross-notebook refs to notebook-as-unit.
-- The shipped 005 design supported @notebook/section. Operator clarified
-- the design intent: refs may name another notebook AS A UNIT (like a
-- library dependency) but may not reach into the other notebook's
-- internal sections. Drop the to_slug column, relax the CHECK accordingly,
-- and replace the cross-section unique index with a notebook-root unique
-- index. Refs that previously carried (to_notebook, to_slug) are coerced
-- to notebook-root refs (slug discarded); duplicates collapse onto a
-- single edge per (from_id, to_notebook, role, source).

CREATE TABLE refs_new (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  to_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  to_notebook TEXT,
  role TEXT,
  source TEXT NOT NULL DEFAULT 'html',
  payload_json TEXT,
  etag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (to_id IS NOT NULL AND to_notebook IS NULL)
    OR (to_id IS NULL AND to_notebook IS NOT NULL)
  )
);

-- Local refs copy 1:1.
INSERT INTO refs_new (id, from_id, to_id, role, source, payload_json, etag, created_at)
  SELECT id, from_id, to_id, role, source, payload_json, etag, created_at
  FROM refs WHERE to_id IS NOT NULL;

-- Cross-notebook refs: keep one per (from_id, to_notebook, role, source);
-- the slug is discarded since the new model is notebook-as-unit. MIN(id)
-- collapses duplicates onto the earliest-created edge.
INSERT INTO refs_new (id, from_id, to_id, to_notebook, role, source, payload_json, etag, created_at)
  SELECT MIN(id), from_id, NULL, to_notebook, role, source, payload_json, etag, MIN(created_at)
  FROM refs WHERE to_id IS NULL AND to_notebook IS NOT NULL
  GROUP BY from_id, to_notebook, role, source;

DROP TABLE refs;
ALTER TABLE refs_new RENAME TO refs;

CREATE INDEX refs_from ON refs(from_id);
CREATE INDEX refs_to ON refs(to_id);
CREATE INDEX refs_to_notebook ON refs(to_notebook) WHERE to_notebook IS NOT NULL;
CREATE UNIQUE INDEX refs_unique_local ON refs(from_id, to_id, role, source) WHERE to_id IS NOT NULL;
CREATE UNIQUE INDEX refs_unique_root ON refs(from_id, to_notebook, role, source) WHERE to_id IS NULL;

-- unresolved_refs_json entries from the shipped design carry both notebook
-- and slug for cross-refs. Rewrite each section's column to drop the slug
-- on cross entries (notebook present) — they collapse to notebook-root
-- form. Local entries are left alone. SQLite's json_each + json_group_array
-- handle the rewrite in pure SQL.
UPDATE sections SET unresolved_refs_json = (
  SELECT json_group_array(
    CASE
      WHEN json_extract(value, '$.notebook') IS NOT NULL THEN
        json_object(
          'notebook', json_extract(value, '$.notebook'),
          'source',   json_extract(value, '$.source'),
          'role',     json_extract(value, '$.role'),
          'field',    json_extract(value, '$.field')
        )
      ELSE value
    END
  )
  FROM json_each(unresolved_refs_json)
)
WHERE json_array_length(unresolved_refs_json) > 0;
