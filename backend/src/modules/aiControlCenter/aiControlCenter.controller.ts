import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { openEventStream } from "../../http/eventStream";
import type { StoredProvider } from "../../lib/llm/controlCenter/store";
import * as aiService from "./aiControlCenter.service";

export async function state(_req: Request, res: Response): Promise<void> {
  res.json(aiService.getState());
}

/** `?fresh=1` skips the 20 s cache. */
export async function health(req: Request, res: Response): Promise<void> {
  res.json(await aiService.health(req.query.fresh === "1"));
}

export async function saveProvider(req: Request, res: Response): Promise<void> {
  aiService.saveProvider(req.params.id, asBody(req.body) as Partial<StoredProvider>);
  res.json({ ok: true });
}

export async function removeProvider(req: Request, res: Response): Promise<void> {
  aiService.removeProvider(req.params.id);
  res.json({ ok: true });
}

export async function saveKey(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const saved = await aiService.saveProviderKey(req.params.id, String(body.apiKey ?? ""), body.skipVerify === true);
  res.json({ ok: true, ...saved });
}

export async function removeKey(req: Request, res: Response): Promise<void> {
  res.json({ ok: true, affectedRoles: aiService.removeProviderKey(req.params.id) });
}

export async function models(req: Request, res: Response): Promise<void> {
  res.json(await aiService.listProviderModels(req.params.id));
}

export async function test(req: Request, res: Response): Promise<void> {
  res.json(await aiService.testProvider(req.params.id, str(asBody(req.body).model) || undefined));
}

export async function probeTools(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  res.json(await aiService.probeTools(str(body.provider) || undefined, str(body.model) || undefined));
}

export async function assignRoles(req: Request, res: Response): Promise<void> {
  const effective = await aiService.assignRoles(asBody(req.body) as Parameters<typeof aiService.assignRoles>[0]);
  res.json({ ok: true, effective });
}

export async function policy(req: Request, res: Response): Promise<void> {
  res.json({ ok: true, effective: aiService.setLocalOnly(asBody(req.body).localOnly) });
}

export async function local(_req: Request, res: Response): Promise<void> {
  res.json(await aiService.localRuntimes());
}

export async function startLocal(_req: Request, res: Response): Promise<void> {
  await aiService.startLocalRuntime();
  res.json({ ok: true });
}

/** SSE: streams `ollama pull` progress as { status, completed, total, percent }. */
export async function pull(req: Request, res: Response): Promise<void> {
  const model = String(asBody(req.body).model ?? "").trim();
  await aiService.checkCanPull(model);
  const stream = openEventStream(res);
  await aiService.pullModel(model, stream.send, stream.signal);
  stream.end();
}

export async function deleteLocalModel(req: Request, res: Response): Promise<void> {
  await aiService.deleteLocalModel(req.params.name);
  res.json({ ok: true });
}

export async function quickSetupLocal(req: Request, res: Response): Promise<void> {
  const result = await aiService.quickSetupLocal(String(asBody(req.body).model ?? "").trim());
  res.json({ ok: true, ...result });
}

export async function quickSetupCloud(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const result = await aiService.quickSetupCloud(str(body.provider) || undefined, str(body.model) || undefined);
  res.json({ ok: true, ...result });
}
