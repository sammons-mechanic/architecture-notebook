import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { is_within_root } from '../server/routes/spa.ts';

// Regression for the sibling-prefix traversal-guard defect: the static-asset
// containment check used `candidate.startsWith(web_root)` with no trailing
// separator, so a sibling directory whose name extends the root's final
// segment (web/dist vs web/distractor) satisfied the guard and could escape
// the asset root. is_within_root is the corrected boundary; these cases pin
// both the accept side (root + descendants) and the reject side (the sibling
// prefix that the old guard let through, plus parent/`..` escapes).
describe('is_within_root containment boundary', () => {
  test('accepts root and descendants; rejects sibling-prefix and parent escapes', () => {
    const root = resolve('/srv/app/web/dist');
    const results = {
      root_itself: is_within_root(root, root),
      direct_child: is_within_root(root, root + sep + 'main.js'),
      nested_child: is_within_root(root, resolve(root, 'assets', 'app.css')),
      // The defect: a sibling directory that extends the final segment.
      sibling_prefix_dir: is_within_root(root, root + 'ractor'),
      sibling_prefix_file: is_within_root(root, root + 'ractor' + sep + 'secret.txt'),
      // Parent and a sibling reached through `..`.
      parent_dir: is_within_root(root, resolve(root, '..')),
      sibling_via_dotdot: is_within_root(root, resolve(root, '..', 'distractor', 'secret.txt')),
    };
    assert.deepEqual(results, {
      root_itself: true,
      direct_child: true,
      nested_child: true,
      sibling_prefix_dir: false,
      sibling_prefix_file: false,
      parent_dir: false,
      sibling_via_dotdot: false,
    });
  });
});
