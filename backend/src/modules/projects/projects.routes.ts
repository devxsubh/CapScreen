import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as projectsController from "./projects.controller";

/** /projects */
export const projectsRouter = Router();

projectsRouter.get("/", asyncHandler(projectsController.list));
projectsRouter.get("/:projectId", asyncHandler(projectsController.get));
