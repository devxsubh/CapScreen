import type { Request, Response } from "express";
import { currentUser } from "../../http/currentUser";
import * as portfolioService from "./portfolio.service";

export async function sync(_req: Request, res: Response): Promise<void> {
  res.json(await portfolioService.syncGrid(currentUser(res)));
}

export async function review(_req: Request, res: Response): Promise<void> {
  res.json({ reviewId: await portfolioService.portfolioReviewId(currentUser(res)) });
}

export async function rescreen(_req: Request, res: Response): Promise<void> {
  res.json(await portfolioService.rescreen(currentUser(res)));
}

export async function digest(_req: Request, res: Response): Promise<void> {
  res.json(await portfolioService.latestDigest());
}

export async function createEntityReview(req: Request, res: Response): Promise<void> {
  const reviewId = await portfolioService.createEntityReviewGrid(req.params.startupId, currentUser(res));
  res.status(201).json({ reviewId });
}

export async function compare(req: Request, res: Response): Promise<void> {
  const ids = String(req.query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  res.json(await portfolioService.compare(ids, currentUser(res).userId));
}
