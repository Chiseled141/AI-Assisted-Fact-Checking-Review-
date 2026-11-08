import { vi } from 'vitest';

/**
 * Intercept the HTTP client's fetch calls in memory. There is no live test server or network fallback.
 *
 * The header asks who is signed in on every page. That call isn't counted in the returned mock: a test that answers
 * it with an account is signed in, and any other answer leaves the visitor signed out.
 */
export function interceptRequests(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(new URL(String(input), 'http://localhost'), init)),
  );
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname !== '/api/auth/me') return fetchMock(input, init);
    try {
      const response = await handler(url, init);
      const body = response.ok ? await response.clone().json() : undefined;
      if (typeof body?.username === 'string') return response;
    } catch {
      // A handler that doesn't expect this call: treat the visitor as signed out.
    }
    return jsonResponse({ detail: 'Log in to continue.' }, 401);
  });
  return fetchMock;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
