import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as documentsController from "./documents.controller";
import { documentUpload, ragUpload } from "./uploads";

/** /single-documents — the user's uploaded files outside any project. */
export const storedDocumentsRouter = Router();

storedDocumentsRouter.get("/", asyncHandler(documentsController.listStored));
storedDocumentsRouter.post("/", documentUpload.single("file"), asyncHandler(documentsController.uploadStored));
storedDocumentsRouter.get("/:docId/url", asyncHandler(documentsController.storedUrl));
storedDocumentsRouter.delete("/:docId", asyncHandler(documentsController.deleteStored));

/** /projects/:projectId/documents — upload into a project. */
export const projectDocumentsRouter = Router({ mergeParams: true });

projectDocumentsRouter.post("/", documentUpload.single("file"), asyncHandler(documentsController.uploadToProject));

/** /api/documents — generated documents by id. */
export const generatedDocumentsRouter = Router();

generatedDocumentsRouter.get("/:docId/view", asyncHandler(documentsController.viewGenerated));
generatedDocumentsRouter.get("/:docId/download", asyncHandler(documentsController.downloadGenerated));

/** /api/startups/:id/ic-memo */
export const icMemoRouter = Router({ mergeParams: true });

icMemoRouter.post("/", asyncHandler(documentsController.createIcMemo));
icMemoRouter.get("/", asyncHandler(documentsController.listIcMemos));
icMemoRouter.get("/latest", asyncHandler(documentsController.latestIcMemo));
icMemoRouter.get("/:docId", asyncHandler(documentsController.getIcMemo));

/** /api/startups/:id/documents */
export const startupDocumentsRouter = Router({ mergeParams: true });

startupDocumentsRouter.get("/:docId/download", asyncHandler(documentsController.redirectDownload));

/** /api/startups/:id/rag-documents */
export const ragDocumentsRouter = Router({ mergeParams: true });

ragDocumentsRouter.get("/", asyncHandler(documentsController.listRag));
ragDocumentsRouter.post("/", ragUpload.single("file"), asyncHandler(documentsController.uploadRag));
ragDocumentsRouter.delete("/:docId", asyncHandler(documentsController.deleteRag));
