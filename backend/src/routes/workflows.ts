import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as store from "../lib/workflows/workflowMemory";
import { connectDb } from "../lib/infra/db";

export const workflowsRouter = Router();

type AsyncRoute = (req: Request, res: Response) => Promise<unknown>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

workflowsRouter.use(requireAuth);
workflowsRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

// GET /workflows — built-in + the user's own
workflowsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    const { type } = req.query as { type?: string };
    if (type && type !== "assistant" && type !== "tabular") {
      res.status(400).json({ detail: "type must be 'assistant' or 'tabular'" });
      return;
    }
    res.json(await store.listWorkflows(userId, type as store.WorkflowType | undefined));
  }),
);

// POST /workflows
workflowsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    const { title, type, prompt_md, columns_config, practice } = req.body as {
      title?: string;
      type?: string;
      prompt_md?: string;
      columns_config?: store.ColumnConfig[];
      practice?: string | null;
    };

    if (!title?.trim()) {
      res.status(400).json({ detail: "title is required" });
      return;
    }
    if (type !== "assistant" && type !== "tabular") {
      res.status(400).json({ detail: "type must be 'assistant' or 'tabular'" });
      return;
    }

    const created = await store.createWorkflow(userId, {
      title,
      type,
      prompt_md,
      columns_config,
      practice,
    });
    res.status(201).json(created);
  }),
);

async function handleWorkflowUpdate(req: Request, res: Response) {
  const userId = res.locals.userId as string;
  const { workflowId } = req.params;
  const updates: {
    title?: string;
    prompt_md?: string;
    columns_config?: store.ColumnConfig[];
    practice?: string | null;
  } = {};
  if (req.body.title != null) updates.title = req.body.title;
  if (req.body.prompt_md != null) updates.prompt_md = req.body.prompt_md;
  if (req.body.columns_config != null) {
    updates.columns_config = req.body.columns_config;
  }
  if ("practice" in req.body) updates.practice = req.body.practice ?? null;

  const updated = await store.updateWorkflow(workflowId, userId, updates);
  if (!updated) {
    res.status(404).json({ detail: "Workflow not found or not editable" });
    return;
  }
  res.json(updated);
}

workflowsRouter.put("/:workflowId", asyncRoute(handleWorkflowUpdate));
workflowsRouter.patch("/:workflowId", asyncRoute(handleWorkflowUpdate));

// DELETE /workflows/:workflowId
workflowsRouter.delete(
  "/:workflowId",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    if (!(await store.deleteWorkflow(req.params.workflowId, userId))) {
      res.status(404).json({ detail: "Workflow not found" });
      return;
    }
    res.status(204).send();
  }),
);

// GET /workflows/hidden
workflowsRouter.get(
  "/hidden",
  asyncRoute(async (_req, res) => {
    const userId = res.locals.userId as string;
    res.json(await store.listHiddenWorkflowIds(userId));
  }),
);

// POST /workflows/hidden
workflowsRouter.post(
  "/hidden",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    const { workflow_id } = req.body as { workflow_id?: string };
    if (!workflow_id?.trim()) {
      res.status(400).json({ detail: "workflow_id is required" });
      return;
    }
    await store.hideWorkflow(userId, workflow_id);
    res.status(204).send();
  }),
);

// DELETE /workflows/hidden/:workflowId
workflowsRouter.delete(
  "/hidden/:workflowId",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    await store.unhideWorkflow(userId, req.params.workflowId);
    res.status(204).send();
  }),
);

// GET /workflows/:workflowId
workflowsRouter.get(
  "/:workflowId",
  asyncRoute(async (req, res) => {
    const userId = res.locals.userId as string;
    const workflow = await store.getWorkflowById(req.params.workflowId, userId);
    if (!workflow) {
      res.status(404).json({ detail: "Workflow not found" });
      return;
    }
    res.json(workflow);
  }),
);

workflowsRouter.use(
  (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    console.error("[workflows] unhandled route error", err);
    res.status(500).json({ detail: "Failed to process workflow request" });
  },
);
