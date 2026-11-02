/** Set `VITE_API_URL` to use the real backend. Without it the app plays back fixtures, and says so on screen. */
export const apiUrl: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
// '/' is a real setting: it means the API is on the same address as the page, as under Nginx.
export const demoMode = !import.meta.env.VITE_API_URL;
