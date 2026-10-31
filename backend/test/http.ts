import type { Server } from "http";
import type { AddressInfo } from "net";
import { after, before } from "node:test";
import type express from "express";

export type ApiResponse = {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
};

export type ApiClient = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<ApiResponse>;

/** Serve the app on a free loopback port for the whole test file. */
export function serveForTests(createApp: () => express.Express): ApiClient {
  let server: Server;
  let base = "";
  before(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  return async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON (CSV, SSE, HTML)
    }
    return { status: res.status, headers: res.headers, body: parsed, text };
  };
}
