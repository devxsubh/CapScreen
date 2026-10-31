import type { Response } from "express";

export type EventStream = {
  /** Write a raw, already-framed SSE line. */
  write: (line: string) => void;
  /** Send one `data:` event with a JSON payload. */
  send: (payload: unknown) => void;
  /** Send the `[DONE]` marker the frontend waits for. */
  done: () => void;
  /** Aborted when the client disconnects. */
  signal: AbortSignal;
  end: () => void;
};

/** Switch the response to Server-Sent Events. */
export function openEventStream(res: Response): EventStream {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  const write = (line: string) => {
    res.write(line);
  };
  return {
    write,
    send: (payload) => write(`data: ${JSON.stringify(payload)}\n\n`),
    done: () => write("data: [DONE]\n\n"),
    signal: abort.signal,
    end: () => res.end(),
  };
}
