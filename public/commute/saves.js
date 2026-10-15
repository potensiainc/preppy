// Only public dataset IDs belong here. Account credentials and location never do.
export const SAVE_KEY = 'preppy.schoolmap.saved.v1';
export function readSaves(storage, schools) {
  try {
    const value = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.schoolIds)) return new Set();
    const allowed = new Set(schools.map(s => s.id));
    return new Set(value.schoolIds.filter(id => typeof id === 'string' && allowed.has(id)));
  } catch { return new Set(); }
}
export function writeSaves(storage, saved) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({version:1, schoolIds:[...saved]}));
    return true;
  } catch { return false; }
}
