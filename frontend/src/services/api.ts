// Use the same origin by default: Vite proxies /api to the backend.
// VITE_API_URL can point to a separately hosted backend.
export const apiUrl: string = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
