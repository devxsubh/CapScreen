import http from "http";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { protocol, session } from "electron";
import type { RuntimeInfo } from "./sidecars";

/**
 * capscreen://app/…        → Next.js server (127.0.0.1:<port>)
 * capscreen://app/__api/…  → backend (127.0.0.1:<port>), token attached here
 *
 * A fixed origin keeps localStorage stable across launches (ports change), and
 * routing the API through the same origin keeps the desktop token out of the
 * renderer entirely.
 */
export const SCHEME = "capscreen";
export const APP_ORIGIN = `${SCHEME}://app`;
export const API_PREFIX = "/__api";
const TOKEN_HEADER = "x-capscreen-token";

/** Must run before app "ready". */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
    },
  ]);
}

const HOP_BY_HOP = ["host", "connection", "origin", "referer", "content-length"];

export function handleAppProtocol(rt: RuntimeInfo): void {
  protocol.handle(SCHEME, async (req) => {
    try {
      return await proxy(rt, req);
    } catch (err) {
      console.error(`[protocol] ${req.method} ${req.url} failed:`, err);
      return new Response(`CapScreen could not reach a local service: ${err instanceof Error ? err.message : String(err)}`, {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  });
}

/**
 * Forward with node:http rather than net.fetch: net.fetch cannot hand back a
 * redirect untouched (redirect:"manual" throws), and we need to rewrite Next's
 * redirects onto the app origin. Bodies stream both ways (SSE, uploads).
 */
async function proxy(rt: RuntimeInfo, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isApi = url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
  const upstream = isApi ? rt.backendUrl : rt.frontendUrl;
  const target = new URL(`${upstream}${isApi ? url.pathname.slice(API_PREFIX.length) || "/" : url.pathname}${url.search}`);

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.includes(key)) headers[key] = value;
  });
  if (isApi) headers[TOKEN_HEADER] = rt.token;

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const out = http.request(target, { method: req.method, headers }, resolve);
    out.on("error", reject);
    if (req.body && req.method !== "GET" && req.method !== "HEAD") {
      Readable.fromWeb(req.body as unknown as WebReadableStream).on("error", reject).pipe(out);
    } else {
      out.end();
    }
  });

  const respHeaders = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || key === "transfer-encoding" || key === "connection") continue;
    for (const v of Array.isArray(value) ? value : [value]) respHeaders.append(key, v);
  }
  const status = res.statusCode ?? 502;

  // Keep redirects inside the app origin.
  const location = respHeaders.get("location");
  if (location && status >= 300 && status < 400) {
    if (location.startsWith(upstream)) respHeaders.set("location", APP_ORIGIN + location.slice(upstream.length));
    res.resume();
    return new Response(null, { status, headers: respHeaders });
  }

  const noBody = req.method === "HEAD" || status === 204 || status === 304;
  if (noBody) res.resume();
  return new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), { status, headers: respHeaders });
}

/** Dev mode: the page loads Next directly, so attach the token on the wire instead. */
export function injectTokenForDev(rt: RuntimeInfo): void {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${rt.backendUrl}/*`] }, (details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, [TOKEN_HEADER]: rt.token } });
  });
}
