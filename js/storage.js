// Safe localStorage / sessionStorage wrappers for restricted browser modes
export function lsGet(k, def = null) {
  try { const v = localStorage.getItem(k); return v === null ? def : v; } catch { return def; }
}
export function lsSet(k, v) {
  try { localStorage.setItem(k, String(v)); } catch {}
}
export function lsDel(k) {
  try { localStorage.removeItem(k); } catch {}
}
export function ssGet(k, def = null) {
  try { const v = sessionStorage.getItem(k); return v === null ? def : v; } catch { return def; }
}
export function ssSet(k, v) {
  try { sessionStorage.setItem(k, String(v)); } catch {}
}
