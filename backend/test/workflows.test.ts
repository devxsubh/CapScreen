import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_WORKFLOWS } from "../src/modules/workflows/builtinWorkflows";
import {
  buildWorkflowStore,
  createWorkflow,
  deleteWorkflow,
  getWorkflowById,
  hideWorkflow,
  listHiddenWorkflowIds,
  listWorkflows,
  unhideWorkflow,
  updateWorkflow,
} from "../src/modules/workflows/workflows.service";
import { useTempDatabase } from "./helpers";

useTempDatabase();
const USER = "local-user";

test("built-in workflows are listed first and are read-only", async () => {
  const all = await listWorkflows(USER);
  assert.equal(all.length, BUILTIN_WORKFLOWS.length);
  assert.ok(all.every((w) => w.is_system));
  assert.equal((await listWorkflows(USER, "tabular")).length, BUILTIN_WORKFLOWS.filter((w) => w.type === "tabular").length);

  const builtin = await getWorkflowById("builtin-ic-memo", USER);
  assert.equal(builtin?.title, "IC Compliance Memo");
  assert.equal(await updateWorkflow("builtin-ic-memo", USER, { title: "x" }), null);
  assert.equal(await deleteWorkflow("builtin-ic-memo", USER), false);
});

test("custom workflow lifecycle", async () => {
  const wf = await createWorkflow(USER, { title: "  My screen ", type: "assistant", prompt_md: "Do it" });
  assert.equal(wf.title, "My screen");
  assert.ok((await listWorkflows(USER, "assistant")).some((w) => w.id === wf.id && !w.is_system));

  const updated = await updateWorkflow(wf.id, USER, { prompt_md: "Do it better" });
  assert.equal(updated?.prompt_md, "Do it better");

  const store = await buildWorkflowStore(USER);
  assert.equal(store.get(wf.id)?.prompt_md, "Do it better");
  assert.ok(store.has("builtin-cap-table-screen"));

  assert.equal(await getWorkflowById(wf.id, "someone-else"), null);
  assert.equal(await deleteWorkflow(wf.id, USER), true);
  assert.equal(await getWorkflowById(wf.id, USER), null);
});

test("hiding a built-in is remembered", async () => {
  await hideWorkflow(USER, "builtin-aml-screening-summary");
  await hideWorkflow(USER, "builtin-aml-screening-summary");
  assert.deepEqual(await listHiddenWorkflowIds(USER), ["builtin-aml-screening-summary"]);
  await unhideWorkflow(USER, "builtin-aml-screening-summary");
  assert.deepEqual(await listHiddenWorkflowIds(USER), []);
});
