import assert from 'node:assert/strict';
import test from 'node:test';

import { loadKey, saveKey } from '../src/storage.js';

function useMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return values;
}

test('saveKey serializes a value and loadKey restores it', async () => {
  const values = useMemoryStorage();

  await saveKey('profile', { units: 'metric', goalWeight: 75 });

  assert.equal(values.get('profile'), '{"units":"metric","goalWeight":75}');
  assert.deepEqual(await loadKey('profile', {}), {
    units: 'metric',
    goalWeight: 75,
  });
});

test('loadKey returns the caller fallback for missing or malformed data', async () => {
  useMemoryStorage({ broken: '{not-json' });

  assert.deepEqual(await loadKey('missing', []), []);
  assert.deepEqual(await loadKey('broken', { safe: true }), { safe: true });
});
