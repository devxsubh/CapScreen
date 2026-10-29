# Agent harness (LangGraph)

How CapScreen's assistant runs: the graph, how tools run, sub-agents, plans and approvals.

| File | What it does |
|---|---|
| `backend/src/lib/agent/agentGraph.ts` | The agent as a LangGraph `StateGraph`: nodes, routing, `interrupt()` for approvals, run/resume helpers |
| `backend/src/lib/agent/runTools.ts` | Runs one round of tool calls: parallel reads, timeouts, error capture, trimming |
| `backend/src/lib/tools/delegateTool.ts` | `delegate_task`: sub-agents (same graph, read-only tools) |
| `backend/src/lib/tools/planTool.ts` | `update_plan`: live checklist |
| `backend/src/routes/assistantChat.ts` | Streams a turn over SSE; forces `screen_cap_table` on a first CSV turn; `POST /chat/runs/:runId/resume` for Allow / Deny |

Packages: `@langchain/langgraph` and its peer `@langchain/core`. We use LangGraph for orchestration only. Models are still called through our own provider layer (`lib/llm/providers/`), so Claude, OpenAI-compatible APIs, Ollama, LM Studio, BYO keys and local-only mode all keep working.

## The graph

```
           ┌─────────────┐  no tools   ┌─────┐
  START ──▶│  callModel  │────────────▶│ END │
           └─────────────┘             └─────┘
             │ tools   ▲                   ▲
             │         │ under limit       │
             ▼         │                   │
  ┌─────────────┐   ┌──────────┐  limit  ┌──────────────────┐
  │ askApproval │──▶│ runTools │────────▶│ stopAtRoundLimit │
  └─────────────┘   └──────────┘         └──────────────────┘
    (only if a tool needs the user's OK)
```

**State** (`AgentState`): the conversation (`messages`), the model's pending tool calls, which ones the user declined, a round counter and the answer text. Reducers append to `messages`, `answer` and `toolActivity`; everything else is "last value wins".

**Nodes**
- `callModel`: streams the model's reply to the browser (SSE) and stores any tool calls it asked for.
- `askApproval`: calls LangGraph's `interrupt()` with the calls the user must approve. The graph stops there.
- `runTools`: runs the pending calls (see below) and adds the results to the conversation.
- `stopAtRoundLimit`: stops a model that keeps calling tools (8 rounds; 5 for sub-agents).

**Routing** is two plain functions of the state, `afterModel` and `afterTools`, which makes them easy to test and reason about.

**Runtime context.** Per-run dependencies (tool registry, the SSE writer, model role, whether to ask for approval) are passed as LangGraph runtime context (`invoke(input, { context })`). Nodes read them from `runtime.context`. They are never written into checkpoints.

## Approvals (human in the loop)

1. The model asks for `web_search`, the only tool marked `needsApproval` because it sends the query to an outside service.
2. `askApproval` calls `interrupt({ calls })`. The **checkpointer** saves the graph state and `runAgent` returns `needs_approval` with a `runId` (the LangGraph thread id).
3. The route remembers who the run belongs to and the tool context, then sends `approval_required`. The UI shows `ApprovalCard` with the exact query.
4. The user clicks Allow or Deny, which calls `POST /chat/runs/:runId/resume { approved }`. The route checks the run is this user's and still waiting, removes it (so it can't be answered twice), writes an `agent_tool_approval` audit log entry, and calls `resumeAgent`.
5. `resumeAgent` sends `new Command({ resume: { approved } })`. `interrupt()` returns the answer, `askApproval` records any declined calls, and the graph carries on. A declined call gets "the user declined this tool call" as its result.

The checkpointer is LangGraph's `MemorySaver`. A finished run's state is deleted right away; a paused run is kept for 24 h.
**Trade-off:** a paused run doesn't survive restarting the app. LangGraph's SQLite checkpointer needs a native module, which our esbuild desktop bundle avoids. A custom saver on our SQLite store would fix this if it ever matters.

## Running tools (`runTools.ts`)

| Behaviour | Why |
|---|---|
| Consecutive **read-only** tools run in parallel; anything that changes data runs one at a time, in order | Faster, and never reads data a previous call is still changing |
| A tool that throws, times out (5 min) or gets bad input returns an error **message** instead of crashing | The model can recover or tell the user |
| Results over 20,000 characters are trimmed | One big result can't fill the context window |

Tools declare `readOnly` and `needsApproval` in `lib/tools/registry.ts`.

## Sub-agents

`delegate_task` runs the **same graph compiled without a checkpointer** (`subAgentGraph`), with read-only tools only and no output to the screen. Only its final summary goes back. Because `delegate_task` is read-only, several calls in one turn run in parallel, for example one sub-agent per flagged entity.

## Plans

For jobs with 3 or more steps the model calls `update_plan` with the full checklist. `AgentPlan.tsx` shows it and updates it in place.

## Cancellation

If the user closes the chat or hits Stop, the route aborts the `AbortSignal` passed to `graph.invoke`. LangGraph stops the run and we report `cancelled`.

## Where each route uses it

| Route | Approvals | Notes |
|---|---|---|
| `POST /chat` (assistant and the startup page chat) | on | Plans, sub-agents, approvals, resume. The startup page sends `startup_id` and renders the same `ApprovalCard` |
| Tabular review chat (`POST /tabular-review/:id/chat`) | off | No approval UI there yet, so `web_search` runs without asking |

## Design choices worth knowing

- **LangGraph for orchestration, our own layer for models.** LangChain's chat-model wrappers would duplicate the AI Control Center (local models, local-only mode, models without tool support).
- **The AI never decides sanctions hits.** Watchman matching stays deterministic. The agent only orchestrates tools and explains results.
- **Approval gates the whole round.** If any call in a round needs approval, none of that round's calls run until the user answers.
