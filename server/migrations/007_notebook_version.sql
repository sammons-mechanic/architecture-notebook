-- Notebook version becomes major.minor. Minor auto-bumps on every content-
-- mutating request; major is human-set (and resets minor). Carry any prior
-- manual `notebook_revision` forward as the major so existing notebooks keep
-- their number; minor starts at 0.
INSERT OR IGNORE INTO meta(key, value)
  VALUES ('notebook_major', COALESCE((SELECT value FROM meta WHERE key = 'notebook_revision'), '0'));
INSERT OR IGNORE INTO meta(key, value) VALUES ('notebook_minor', '0');
