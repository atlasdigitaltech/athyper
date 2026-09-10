import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogMap, compare } from '../../lib/database-catalog.js';

test('catalog comparisons preserve significant SQL whitespace', () => {
  for (const [target, live] of [
    ["'a  b'::text", "'a b'::text"],
    ['SELECT $$a\nb$$', 'SELECT $$a b$$'],
    ['SELECT "a  b"', 'SELECT "a b"'],
    ['SELECT 1 -- comment\n + 2', 'SELECT 1 -- comment + 2'],
  ]) {
    const result = compare(
      catalogMap([{ object_key: 'probe.object', definition: target! }]),
      catalogMap([{ object_key: 'probe.object', definition: live! }]),
    );
    assert.deepEqual(result.changed, [{ object_key: 'probe.object', target, live }]);
  }
});

test('catalog comparisons report additions/removals and ignore row ordering', () => {
  const a = { object_key: 'probe.a', definition: 'integer' };
  const b = { object_key: 'probe.b', definition: 'text' };
  assert.deepEqual(compare(catalogMap([a, b]), catalogMap([b, a])), {
    missing_in_live: [], extra_in_live: [], changed: [],
  });
  assert.deepEqual(compare(catalogMap([a]), catalogMap([b])), {
    missing_in_live: ['probe.a'], extra_in_live: ['probe.b'], changed: [],
  });
});
