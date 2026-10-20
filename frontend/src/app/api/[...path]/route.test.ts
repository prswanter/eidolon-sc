import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function backendAnswers(response: () => Response) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function get(path: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost:3000/api/${path}`, { headers }), {
    params: Promise.resolve({ path: path.split("/") }),
  });
}

describe("forwarding /api/* to the backend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on what the browser needs to cache an avatar", async () => {
    backendAnswers(
      () =>
        new Response("jpeg", {
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "public, max-age=86400",
            etag: '"abc"',
          },
        }),
    );

    const res = await get("characters/mano/avatar");

    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("etag")).toBe('"abc"');
  });

  it("asks the backend whether the browser's copy is still current, and passes on its 304", async () => {
    const fetch = backendAnswers(() => new Response(null, { status: 304, headers: { etag: '"abc"' } }));

    const res = await get("characters/mano/avatar", { "if-none-match": '"abc"' });

    const sent = new Headers(fetch.mock.calls[0][1].headers);
    expect(sent.get("if-none-match")).toBe('"abc"');
    expect(res.status).toBe(304);
    expect(res.body).toBeNull();
  });
});
