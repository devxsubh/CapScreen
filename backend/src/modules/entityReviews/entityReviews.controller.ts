import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import * as entityReviewsService from "./entityReviews.service";
import { REVIEW_STATUSES, type ReviewStatus } from "./entityReviews.service";
import { toEntityReview } from "./entityReviews.serializer";

export async function list(req: Request, res: Response): Promise<void> {
  const reviews = await entityReviewsService.listReviews(req.params.id);
  res.json(reviews.map(toEntityReview));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const entityName = str(body.entityName).trim();
  const status = str(body.status);
  if (!entityName) throw badRequest("entityName is required");
  if (!(REVIEW_STATUSES as readonly string[]).includes(status)) {
    throw badRequest("status must be one of: " + REVIEW_STATUSES.join(", "));
  }
  const review = await entityReviewsService.recordReview(
    req.params.id,
    { entityName, status: status as ReviewStatus, notes: typeof body.notes === "string" ? body.notes.trim() : null },
    currentUser(res),
  );
  res.status(201).json(toEntityReview(review));
}
