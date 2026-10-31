import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as filesController from "./files.controller";

/** /api/files — signed download links (exempt from the desktop token; see middleware/desktopToken.ts). */
export const filesRouter = Router();

filesRouter.get("/:token", asyncHandler(filesController.download));
