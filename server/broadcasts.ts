import type { Database } from './db.ts';
import { insert_notebook_ref, find_existing_notebook_ref } from './repo-refs.ts';
import type { UnresolvedRefEntry } from './refs-sync.ts';

// Resolve notebook-unit unresolved entries in peer_db whose `notebook`
// matches `notebook_slug`. Insert a notebook-ref edge and remove the
// entry from unresolved_refs_json. Wraps mutations in a per-peer
// transaction so the section's unresolved list and freshly-materialized
// edge cannot be observed in inconsistent states.
const resolve_in_peer = (peer_db: Database, notebook_slug: string): void => {
  const candidates = peer_db
    .prepare(
      'SELECT id, unresolved_refs_json FROM sections WHERE unresolved_refs_json LIKE ?'
    )
    .all(`%"notebook":"${notebook_slug}"%`) as Array<{ id: number; unresolved_refs_json: string }>;
  if (candidates.length === 0) return;
  peer_db.exec('BEGIN');
  try {
    for (const row of candidates) {
      const entries = JSON.parse(row.unresolved_refs_json) as UnresolvedRefEntry[];
      const remaining: UnresolvedRefEntry[] = [];
      let changed = false;
      for (const entry of entries) {
        if (entry.notebook !== notebook_slug) {
          remaining.push(entry);
          continue;
        }
        const role = entry.source === 'html' ? entry.role ?? null : entry.field ?? null;
        if (!find_existing_notebook_ref(peer_db, row.id, notebook_slug, role, entry.source)) {
          insert_notebook_ref(peer_db, {
            from_id: row.id,
            to_notebook: notebook_slug,
            role,
            source: entry.source,
          });
        }
        changed = true;
      }
      if (changed) {
        peer_db
          .prepare('UPDATE sections SET unresolved_refs_json = ? WHERE id = ?')
          .run(JSON.stringify(remaining), row.id);
      }
    }
    peer_db.exec('COMMIT');
  } catch (err) {
    peer_db.exec('ROLLBACK');
    throw err;
  }
};

export type PeerEntries = Iterable<readonly [string, Database]>;

// Newly-created notebook with `notebook_slug`. Iterate other notebooks
// and resolve any unresolved entries whose notebook matches. Each
// matching entry becomes a real notebook-ref edge.
export const broadcast_notebook_created = (
  peers: PeerEntries,
  notebook_slug: string,
): void => {
  for (const [peer_slug, peer_db] of peers) {
    if (peer_slug === notebook_slug) continue;
    resolve_in_peer(peer_db, notebook_slug);
  }
};

// A notebook with `notebook_slug` was just deleted (or is about to be).
// Iterate every peer; for each notebook-ref edge pointing AT this
// notebook, surface the loss as an unresolved entry on the source
// section then delete the ref edge. Inverse of broadcast_notebook_created.
export const broadcast_notebook_deleted = (
  peers: PeerEntries,
  notebook_slug: string,
): void => {
  for (const [peer_slug, peer_db] of peers) {
    if (peer_slug === notebook_slug) continue;
    const rows = peer_db
      .prepare(
        "SELECT id, from_id, role, source FROM refs WHERE to_notebook = ? AND source IN ('html', 'property')"
      )
      .all(notebook_slug) as Array<{
        id: number;
        from_id: number;
        role: string | null;
        source: 'html' | 'property';
      }>;
    if (rows.length === 0) continue;
    peer_db.exec('BEGIN');
    try {
      const select_src = peer_db.prepare('SELECT unresolved_refs_json FROM sections WHERE id = ?');
      const update_src = peer_db.prepare('UPDATE sections SET unresolved_refs_json = ? WHERE id = ?');
      const delete_ref = peer_db.prepare('DELETE FROM refs WHERE id = ?');
      for (const ref of rows) {
        const src = select_src.get(ref.from_id) as { unresolved_refs_json: string } | undefined;
        if (src) {
          const entries = JSON.parse(src.unresolved_refs_json) as UnresolvedRefEntry[];
          const new_entry: UnresolvedRefEntry =
            ref.source === 'html'
              ? {
                  notebook: notebook_slug,
                  source: 'html',
                  ...(ref.role ? { role: ref.role } : {}),
                }
              : {
                  notebook: notebook_slug,
                  source: 'property',
                  field: ref.role ?? '',
                };
          const new_key = new_entry.source === 'html' ? new_entry.role ?? null : new_entry.field ?? null;
          const duplicate = entries.some((existing) => {
            if (existing.notebook !== new_entry.notebook || existing.source !== new_entry.source) {
              return false;
            }
            const key = existing.source === 'html' ? existing.role ?? null : existing.field ?? null;
            return key === new_key;
          });
          if (!duplicate) {
            entries.push(new_entry);
            update_src.run(JSON.stringify(entries), ref.from_id);
          }
        }
        delete_ref.run(ref.id);
      }
      peer_db.exec('COMMIT');
    } catch (err) {
      peer_db.exec('ROLLBACK');
      throw err;
    }
  }
};
