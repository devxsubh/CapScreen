import net from "net";

/** Ask the OS for a free loopback port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** Poll `url` until it answers 2xx or the deadline passes. */
export async function waitForHttp(url: string, timeoutMs: number, isAlive: () => boolean = () => true): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error(`process exited before ${url} came up`);
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return;
      lastError = `HTTP ${resp.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${url} did not become ready within ${Math.round(timeoutMs / 1000)}s (${lastError})`);
}
