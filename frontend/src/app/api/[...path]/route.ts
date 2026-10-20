// Forwards /api/* to the backend at runtime, streaming the response body so that
// server-sent events reach the browser as they arrive. The browser only ever talks to
// this origin: the session cookie, the Origin the backend checks, and the redirects of
// signing in with Google or GitHub all pass through here.

import { BACKEND_URL } from "@/lib/backend";

async function forward(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const { search } = new URL(request.url);
  const url = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join("/")}${search}`;
  const headers = new Headers();
  for (const name of ["content-type", "cookie", "origin", "x-timezone", "if-none-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const res = await fetch(url, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual", // the browser follows the backend's redirects itself
  });

  const out = new Headers();
  // the etag lets the browser revalidate an avatar instead of downloading it again
  for (const name of ["content-type", "cache-control", "etag", "location", "retry-after"]) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of res.headers.getSetCookie()) out.append("set-cookie", cookie);
  // a 304 has no body, and Response refuses one for it
  return new Response(res.status === 304 ? null : res.body, { status: res.status, headers: out });
}

export const dynamic = "force-dynamic";
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
