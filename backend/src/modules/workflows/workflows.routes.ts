import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as workflowsController from "./workflows.controller";

/** /workflows — built-in workflows plus the user's own. */
export const workflowsRouter = Router();

workflowsRouter.get("/", asyncHandler(workflowsController.list));
workflowsRouter.post("/", asyncHandler(workflowsController.create));
workflowsRouter.get("/hidden", asyncHandler(workflowsController.listHidden));
workflowsRouter.post("/hidden", asyncHandler(workflowsController.hide));
workflowsRouter.delete("/hidden/:workflowId", asyncHandler(workflowsController.unhide));
workflowsRouter.get("/:workflowId", asyncHandler(workflowsController.get));
workflowsRouter.put("/:workflowId", asyncHandler(workflowsController.update));
workflowsRouter.patch("/:workflowId", asyncHandler(workflowsController.update));
workflowsRouter.delete("/:workflowId", asyncHandler(workflowsController.remove));
