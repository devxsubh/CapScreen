import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as tabularReviewsController from "./tabularReviews.controller";

/** /tabular-review */
export const tabularReviewsRouter = Router();

tabularReviewsRouter.get("/", asyncHandler(tabularReviewsController.list));
tabularReviewsRouter.post("/", asyncHandler(tabularReviewsController.create));
tabularReviewsRouter.post("/prompt", asyncHandler(tabularReviewsController.columnPrompt));
tabularReviewsRouter.get("/:id", asyncHandler(tabularReviewsController.get));
tabularReviewsRouter.patch("/:id", asyncHandler(tabularReviewsController.update));
tabularReviewsRouter.delete("/:id", asyncHandler(tabularReviewsController.remove));
tabularReviewsRouter.post("/:id/generate", asyncHandler(tabularReviewsController.generate));
tabularReviewsRouter.post("/:id/regenerate-cell", asyncHandler(tabularReviewsController.setCell));
tabularReviewsRouter.post("/:id/clear-cells", asyncHandler(tabularReviewsController.clearCells));
tabularReviewsRouter.post("/:id/chat", asyncHandler(tabularReviewsController.chat));
tabularReviewsRouter.get("/:id/chats", asyncHandler(tabularReviewsController.listChats));
tabularReviewsRouter.get("/:id/chats/:chatId/messages", asyncHandler(tabularReviewsController.listChats));
tabularReviewsRouter.delete("/:id/chats/:chatId", asyncHandler(tabularReviewsController.noContent));
