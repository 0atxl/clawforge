const API_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
