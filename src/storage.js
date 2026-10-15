/* ---------------------------------- storage ----------------------------------
 *
 * Browser-native storage adapter for Iron Log. All app data is whole-blob
 * key/value JSON, so localStorage is the right fit here:
 *   - synchronous, available at first render, persists between sessions
 *   - works fully offline (it's the origin's own local database)
 *   - well under the ~5MB quota for this kind of text data
 *
 * This replaces the old Claude-artifact `window.storage` API with the same
 * async get/set shape (loadKey / saveKey), so the 40+ call sites in
 * ironlog.jsx don't change at all. If a larger backend (e.g. IndexedDB) is
 * ever needed, only this file needs to change.
 * --------------------------------------------------------------------------- */

export async function loadKey(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const value = JSON.parse(raw);
    if (value === null || value === undefined) return fallback;
    return value;
  } catch (e) {
    console.error(`[storage] loading "${key}" failed`, e);
    return fallback;
  }
}

export async function saveKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[storage] saving "${key}" failed`, e);
  }
}