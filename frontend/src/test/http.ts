import { vi } from 'vitest';

/** Intercept the HTTP client's fetch calls in memory. There is no live test server or network fallback. */
export function interceptRequests(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(new URL(String(input), 'http://localhost'), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
