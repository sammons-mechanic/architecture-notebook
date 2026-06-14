PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE section_types (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  property_schema_json TEXT NOT NULL DEFAULT '{"fields":[]}',
  etag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type_id INTEGER NOT NULL REFERENCES section_types(id) ON DELETE RESTRICT,
  parent_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deck TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  properties_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  html TEXT NOT NULL DEFAULT '',
  etag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX sections_parent_pos ON sections(parent_id, position);

CREATE TABLE refs (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  role TEXT,
  source TEXT NOT NULL DEFAULT 'html',
  payload_json TEXT,
  etag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(from_id, to_id, role, source)
);
CREATE INDEX refs_from ON refs(from_id);
CREATE INDEX refs_to ON refs(to_id);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  body_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_headers_json TEXT NOT NULL,
  response_body TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

INSERT INTO meta(key, value) VALUES('notebook_title', 'Untitled Notebook');
INSERT INTO meta(key, value) VALUES('notebook_revision', '0');
