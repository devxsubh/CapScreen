import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as chatsController from "./chats.controller";

/** /api/chats — saved assistant conversations. */
export const chatsRouter = Router();

chatsRouter.get("/", asyncHandler(chatsController.list));
chatsRouter.post("/", asyncHandler(chatsController.create));
chatsRouter.get("/:id", asyncHandler(chatsController.get));
chatsRouter.patch("/:id", asyncHandler(chatsController.rename));
chatsRouter.put("/:id/messages", asyncHandler(chatsController.saveMessages));
chatsRouter.post("/:id/generate-title", asyncHandler(chatsController.generateTitle));
chatsRouter.delete("/:id", asyncHandler(chatsController.remove));

/** /api/startups/:id/chat — the startup workspace's chat transcript. */
export const startupChatRouter = Router({ mergeParams: true });

startupChatRouter.get("/", asyncHandler(chatsController.getStartupTranscript));
startupChatRouter.put("/", asyncHandler(chatsController.saveStartupTranscript));
