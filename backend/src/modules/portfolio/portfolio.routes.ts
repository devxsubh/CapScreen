import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as portfolioController from "./portfolio.controller";

/** /api/portfolio */
export const portfolioRouter = Router();

portfolioRouter.post("/sync", asyncHandler(portfolioController.sync));
portfolioRouter.get("/review", asyncHandler(portfolioController.review));
portfolioRouter.post("/rescreen", asyncHandler(portfolioController.rescreen));
portfolioRouter.get("/digest", asyncHandler(portfolioController.digest));
portfolioRouter.post("/startups/:startupId/entity-review", asyncHandler(portfolioController.createEntityReview));
portfolioRouter.get("/compare", asyncHandler(portfolioController.compare));
