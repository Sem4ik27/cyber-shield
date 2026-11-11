export const APP_BASE = new URL('../', import.meta.url);

export function apiUrl(path) {
  return new URL(String(path).replace(/^\/+/, ''), APP_BASE).toString();
}
