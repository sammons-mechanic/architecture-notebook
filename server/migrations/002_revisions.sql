CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  deck TEXT,
  html TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  author TEXT,
  message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  UNIQUE (section_id, revision)
);

CREATE INDEX idx_revisions_section ON revisions(section_id, revision DESC);
