import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as entityReviewsController from "./entityReviews.controller";

/** /api/startups/:id/entity-reviews */
export const entityReviewsRouter = Router({ mergeParams: true });

entityReviewsRouter.get("/", asyncHandler(entityReviewsController.list));
entityReviewsRouter.post("/", asyncHandler(entityReviewsController.create));
