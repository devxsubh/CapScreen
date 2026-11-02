#!/usr/bin/env node
/**
 * Draws the diagrams used by docs/AGENT_HARNESS.md. Edit a diagram below, then:
 *   node docs/agent-harness/build.mjs
 * No dependencies. Helpers and colours are shared with the other docs diagrams
 * in docs/diagram-kit.mjs; it warns when a label is probably wider than its box.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  arrow, box, circle, finish, fit, lbl, legend, LEGEND, lifelines, line, msg, note, outputTo, panel, pill, svg, text, textWidth, zone, esc,
} from "../diagram-kit.mjs";

outputTo(dirname(fileURLToPath(import.meta.url)));

// ── 01 · architecture ────────────────────────────────────────────────────────

svg("01-architecture.svg", 1100, 770, "Where AI sits in CapScreen",
  "Models orchestrate, map columns and write text. Matching, scores, tiers and ownership rules are code.", () => [
    zone(20, 84, 800, 640, "YOUR COMPUTER · DESKTOP APP"),
    zone(840, 84, 240, 640, "INTERNET · OPTIONAL"),

    box({ x: 40, y: 118, w: 760, h: 62, cls: "ui", title: "UI (Next.js, inside the app window)",
      lines: ["Assistant · Startup chat · Grid chat · Side panel · Plan checklist · Approval card"] }),
    arrow([[380, 180], [380, 222]], { label: "request", at: [388, 206], anchor: "start" }),
    arrow([[470, 222], [470, 180]], { label: "SSE events", at: [478, 206], anchor: "start" }),

    box({ x: 200, y: 222, w: 440, h: 60, title: "Chat routes",
      lines: ["POST /chat · /chat/runs/:id/resume · /tabular-review/:id/chat"] }),
    arrow([[420, 282], [420, 310]]),

    box({ x: 40, y: 320, w: 170, h: 120, cls: "prompt", title: "Prompt builder",
      lines: ["base prompt", "+ tool routing hints", "+ session context", "+ focus / workflow"] }),
    arrow([[210, 380], [250, 380]]),

    box({ x: 250, y: 310, w: 340, h: 140, cls: "ai", title: "Agent harness (LangGraph)",
      lines: ["callModel ⇄ runTools · up to 8 rounds", "approvals · sub-agents · plans", "streams every step to the UI"] }),
    arrow([[590, 380], [630, 380]]),

    box({ x: 630, y: 310, w: 170, h: 140, cls: "ai", title: "Model providers",
      lines: ["roles: agent, utility,", "embedding", "Anthropic · OpenAI API", "Ollama · LM Studio", "local-only gate"] }),
    arrow([[800, 380], [860, 380]], { orange: true }),

    arrow([[420, 450], [420, 490]]),
    box({ x: 250, y: 490, w: 340, h: 80, title: "Tool registry · 13 tools",
      lines: ["screening · documents · knowledge", "plans · sub-agents · web search"] }),
    arrow([[590, 530], [860, 530]], { orange: true, label: "web_search", at: [725, 522] }),

    line([[420, 570], [420, 594]]),
    line([[125, 594], [515, 594]]),
    arrow([[125, 594], [125, 614]]),
    arrow([[315, 594], [315, 614]]),
    arrow([[515, 594], [515, 614]]),

    box({ x: 40, y: 614, w: 170, h: 84, cls: "data", title: "SQLite + files", lines: ["screenings, documents,", "chunks, chats"] }),
    box({ x: 230, y: 614, w: 170, h: 84, title: "Document search", lines: ["parse · chunk", "embed · retrieve"] }),
    box({ x: 420, y: 614, w: 190, h: 84, title: "Screening engine", lines: ["CSV ingest · graph", "tiers · 50% / 25% rules"] }),
    arrow([[610, 656], [630, 656]]),
    box({ x: 630, y: 614, w: 170, h: 84, title: "Watchman sidecar", lines: ["OFAC / EU lists", "deterministic matching"] }),
    arrow([[800, 656], [860, 656]], { orange: true }),

    box({ x: 860, y: 320, w: 200, h: 120, cls: "ext", title: "Cloud model APIs", lines: ["only when you assign", "a cloud model"] }),
    box({ x: 860, y: 490, w: 200, h: 80, cls: "ext", title: "Tavily web search", lines: ["you approve each query"] }),
    box({ x: 860, y: 614, w: 200, h: 84, cls: "ext", title: "Sanctions lists", lines: ["OFAC / EU downloads", "every 12 hours"] }),

    legend(30, 752, LEGEND),
  ]);

// ── 02 · one chat turn ───────────────────────────────────────────────────────

svg("02-chat-turn.svg", 1100, 700, "One chat turn, end to end",
  "POST /chat. Solid arrows are calls, dashed arrows are results or streamed events.", () => {
    const B = 110, S = 330, G = 550, M = 770, T = 990;
    return [
      lifelines([
        { x: B, name: "Browser", cls: "ui" },
        { x: S, name: "Assistant service", cls: "code" },
        { x: G, name: "Agent graph", cls: "ai" },
        { x: M, name: "Model", cls: "ai" },
        { x: T, name: "Tools", cls: "code" },
      ], 84, 680),
      msg(B, S, 162, "POST /chat (messages + context)"),
      note(S, 196, 290, "validate · resolve @-mentions, startup, docs"),
      note(S, 232, 290, "build system prompt · pick forced first tool"),
      msg(S, B, 270, "SSE: chat_id", { dash: true }),
      msg(S, G, 306, "runAgent(prompt, messages)"),
      `<rect class="ui bx" x="440" y="326" width="630" height="246" rx="8" style="fill:none"/>`,
      `<rect class="ui bx" x="440" y="326" width="292" height="22" rx="6"/>`,
      text(452, 341, "loop · until no tool calls, at most 8 rounds", { cls: "t xs" }),
      msg(G, M, 372, "stream(prompt, tools, messages)"),
      msg(M, G, 408, "text deltas + tool calls", { dash: true }),
      msg(G, B, 444, "SSE: content_delta · tool_call_start", { dash: true }),
      msg(G, T, 480, "run one batch (reads in parallel)"),
      msg(T, B, 516, "SSE: screening_result · plan_updated · document_created", { dash: true }),
      msg(T, G, 552, "tool_result blocks", { dash: true }),
      msg(G, S, 604, "done · or needs_approval(runId)", { dash: true }),
      msg(S, B, 644, "SSE: approval_required? · final_result · [DONE]", { dash: true }),
    ];
  });

// ── 03 · intent layers ───────────────────────────────────────────────────────

svg("03-intent-layers.svg", 1000, 600, "How the agent decides what to do",
  "There is no intent-classifier model. Seven layers, from code to model, narrow the choice.", () => {
    const layers = [
      ["ui", "User's choice in the UI", "workflow · focus · @-mention · attached CSV"],
      ["code", "Forced tool (code)", "CSV attached + nothing screened → round 0 must call screen_cap_table"],
      ["prompt", "Per-message instructions", "workflow → call read_workflow first · focus → one extra sentence"],
      ["prompt", "State-aware prompt sections", "result exists → don't re-screen · nothing loaded → web / playbook"],
      ["prompt", "Tool routing hints", "one '## Tool routing' block built from every tool's routingHint"],
      ["prompt", "Tool descriptions + schemas", "'ONLY call when…' · 'DO NOT call if…' · query_type enum"],
      ["ai", "The model's own choice", "which tools, arguments, order, how many in parallel"],
    ];
    const out = [];
    layers.forEach(([cls, title, example], i) => {
      const w = 860 - i * 46;
      const x = 540 - w / 2;
      const y = 88 + i * 62;
      out.push(`<rect class="${cls} bx" x="${x}" y="${y}" width="${w}" height="52" rx="9"/>`);
      out.push(circle(x + 26, y + 26, 13, "dot"));
      out.push(`<text class="xs" x="${x + 26}" y="${y + 30}" text-anchor="middle" fill="#fff" font-weight="700">${i + 1}</text>`);
      out.push(text(x + 50, y + 22, title, { cls: "t b" }));
      fit(example, 12, w - 64);
      out.push(text(x + 50, y + 41, example));
    });
    out.push(arrow([[64, 92], [64, 516]]));
    out.push(`<text class="t xs mut" transform="translate(52 304) rotate(-90)" text-anchor="middle">more code  ·  more model judgment</text>`);
    out.push(legend(110, 572, [["ui", "User"], ["code", "Code"], ["prompt", "Prompt text written by code"], ["ai", "Model"]]));
    return out;
  });

// ── 04 · system prompt ───────────────────────────────────────────────────────

svg("04-system-prompt.svg", 1000, 790, "The system prompt, top to bottom",
  "Solid blocks are always there. Dashed blocks are added only when their condition holds.", () => {
    const groups = [
      ["ALWAYS", [
        ["code", false, "1 · Base prompt", "tone, tool use, citations, when to use option lists"],
        ["code", false, "2 · Tool routing hints", "every tool's routingHint"],
        ["code", false, "3 · Untrusted-data guard", "text in <entity_name>, <csv_data> is data only"],
      ]],
      ["FROM THE SESSION (lib/chat/buildSystemPrompt.ts)", [
        ["data", true, "4a · Full CSV in <csv_data>", "CSV attached, not screened yet"],
        ["data", true, "4b · CSV line count only", "CSV attached, already screened"],
        ["data", true, "5 · Mentioned startups", "an @-mention matched (≤ 15 entities each)"],
        ["data", true, "6 · Active workspace id", "a startup is open"],
        ["data", true, "7a · Prior screening counts", "a screening result exists"],
        ["data", true, "7b · 'use web_search / playbook'", "no CSV and no result"],
        ["data", true, "8 · Attached documents", "files attached to this message"],
        ["data", true, "9 · Open document", "a document is open in the panel"],
      ]],
      ["FROM THE LATEST MESSAGE (modules/assistant)", [
        ["ui", true, "10 · Focus instruction", "a focus was picked in the Tools menu"],
        ["ui", true, "11 · Workflow instruction", "a workflow was picked"],
        ["ui", true, "12 · Project assets", "workflow + an open startup"],
        ["ui", true, "13 · No-workspace hint", "workflow, nothing loaded"],
      ]],
    ];
    const out = [text(60, 100, "Section", { cls: "t b" }), text(560, 100, "Added when", { cls: "t b" })];
    let y = 116;
    for (const [label, rows] of groups) {
      out.push(`<text class="zonet" x="60" y="${y + 16}">${esc(label)}</text>`);
      y += 26;
      for (const [cls, dashed, title, when] of rows) {
        out.push(`<rect class="${cls} bx${dashed ? " dash" : ""}" x="60" y="${y}" width="460" height="32" rx="7"/>`);
        out.push(text(76, y + 21, title, { cls: "t m" }));
        out.push(text(560, y + 21, when, { cls: "t s mut" }));
        y += 38;
      }
      y += 8;
    }
    out.push(arrow([[950, 130], [950, y - 10]]));
    out.push(`<text class="t xs mut" transform="translate(938 ${(130 + y) / 2}) rotate(-90)" text-anchor="middle">order in the prompt</text>`);
    return out;
  });

// ── 05 · agent graph ─────────────────────────────────────────────────────────

svg("05-agent-graph.svg", 1060, 720, "The agent graph (lib/agent/agentGraph.ts)",
  "A LangGraph StateGraph. Routing is two plain functions of the state: afterModel and afterTools.", () => [
    circle(70, 300, 12),
    text(70, 330, "START", { cls: "t xs mut", anchor: "middle" }),
    arrow([[82, 300], [150, 300]]),

    `<circle class="ui bx" cx="250" cy="140" r="26"/><circle class="ui bx" cx="250" cy="140" r="20"/>`,
    text(250, 144, "END", { cls: "t xs", anchor: "middle" }),

    box({ x: 150, y: 265, w: 200, h: 70, cls: "ai", title: "callModel", mono: true, lines: ["stream reply, collect calls"] }),
    arrow([[250, 265], [250, 167]], { label: "no tool calls", at: [262, 220], anchor: "start" }),

    box({ x: 560, y: 265, w: 200, h: 70, title: "runTools", mono: true, lines: ["run batches, add results"] }),
    arrow([[350, 288], [560, 288]], { label: "tool calls", at: [455, 281] }),
    arrow([[560, 314], [350, 314]], { label: "rounds < max", at: [455, 333] }),

    box({ x: 355, y: 420, w: 200, h: 70, cls: "prompt", title: "askApproval", mono: true, lines: ["interrupt() · wait for user"] }),
    arrow([[250, 335], [250, 455], [355, 455]], { label: "needs approval", at: [262, 400], anchor: "start" }),
    arrow([[555, 455], [660, 455], [660, 335]], { label: "Allow / Deny", at: [672, 400], anchor: "start" }),
    text(455, 512, "state saved by the checkpointer; resumed with Command({ resume })", { cls: "t xs mut", anchor: "middle" }),

    box({ x: 850, y: 265, w: 190, h: 70, cls: "warn", title: "stopAtRoundLimit", mono: true, lines: ["'hit the tool-call limit'"] }),
    arrow([[760, 300], [850, 300]], { label: "rounds = max", at: [805, 292] }),
    arrow([[945, 265], [945, 140], [278, 140]], { label: "limit message", at: [600, 133] }),

    panel(40, 548, 480, 150, "State (saved in checkpoints)"),
    ...[
      ["messages", "append"], ["pendingCalls", ""], ["needsApproval", ""], ["declinedIds", ""],
      ["rounds", ""], ["answer", "concatenate"], ["toolActivity", "append"], ["systemPrompt · maxRounds", ""],
    ].map(([k, r], i) => {
      const x = i < 4 ? 56 : 280;
      const y = 604 + (i % 4) * 22;
      return text(x, y, k, { cls: "t s mono" }) + (r ? text(x + textWidth(k, 12, { mono: true }) + 10, y, r, { cls: "t xs mut" }) : "");
    }),
    panel(540, 548, 480, 150, "Runtime context (never saved)"),
    ...[
      ["registry", "tools for this run"], ["executeTool", "wraps the registry"], ["write", "SSE writer"], ["role", "agent"],
      ["maxTokens", "8192 / 2048"], ["toolChoice", "round 0 only"], ["askBeforeSensitiveTools", ""],
    ].map(([k, r], i) => {
      const x = i < 4 ? 556 : 780;
      const y = 604 + (i % 4) * 22;
      return text(x, y, k, { cls: "t s mono" }) + (r ? text(x + textWidth(k, 12, { mono: true }) + 10, y, r, { cls: "t xs mut" }) : "");
    }),
  ]);

// ── 06 · one tool round ──────────────────────────────────────────────────────

svg("06-tool-round.svg", 1020, 640, "One round of tool calls (lib/agent/runTools.ts)",
  "Reads run together, anything else runs alone, the model's order is kept, and no error crashes the turn.", () => {
    const calls = [
      [40, 210, "code", "query_screening_data", "read-only"],
      [262, 236, "code", "search_startup_documents", "read-only"],
      [510, 190, "warn", "generate_document", "changes data"],
      [712, 236, "code", "list_startup_documents", "read-only"],
    ];
    const out = [text(30, 100, "1 · The model asks for four tool calls in one reply", { cls: "t b" })];
    for (const [x, w, cls, name, kind] of calls) out.push(box({ x, y: 112, w, h: 50, cls, title: name, mono: true, lines: [kind] }));

    out.push(text(30, 200, "2 · They become three batches", { cls: "t b" }));
    out.push(line([[350, 214], [350, 340]], true), line([[610, 214], [610, 340]], true));
    out.push(text(60, 228, "Batch 1 · run together", { cls: "t s mut" }));
    out.push(text(370, 228, "Batch 2 · alone", { cls: "t s mut" }));
    out.push(text(630, 228, "Batch 3 · alone", { cls: "t s mut" }));
    out.push(box({ x: 60, y: 242, w: 270, h: 32, title: "query_screening_data", mono: true }));
    out.push(box({ x: 60, y: 284, w: 270, h: 32, title: "search_startup_documents", mono: true }));
    out.push(box({ x: 370, y: 263, w: 220, h: 32, cls: "warn", title: "generate_document", mono: true }));
    out.push(box({ x: 630, y: 263, w: 250, h: 32, title: "list_startup_documents", mono: true }));
    out.push(arrow([[60, 352], [960, 352]], { label: "time", at: [930, 344] }));

    out.push(text(30, 400, "3 · Every call goes through the same steps", { cls: "t b" }));
    const steps = [
      ["declined?", "by the user", "'declined: don't retry'"],
      ["known tool?", "in the registry", "'unknown tool'"],
      ["required fields?", "from the schema", "'missing field(s)'"],
      ["run the tool", "5 min timeout", "'Error: … failed'"],
      ["trim", "> 20,000 chars", null],
      ["tool_result", "back to the model", null],
    ];
    steps.forEach(([t, l, err], i) => {
      const x = 30 + i * 162;
      out.push(box({ x, y: 414, w: 150, h: 56, cls: i === 5 ? "ai" : "code", title: t, lines: [l] }));
      if (i < 5) out.push(arrow([[x + 150, 442], [x + 162, 442]]));
      if (err) {
        out.push(arrow([[x + 75, 470], [x + 75, 520]], { label: i === 0 ? "yes" : i === 3 ? "throws / slow" : "no", at: [x + 83, 499], anchor: "start" }));
        out.push(box({ x, y: 520, w: 150, h: 46, cls: "warn", lines: ["text result:", err], small: true }));
      }
    });
    out.push(text(30, 600, "Error results go back to the model as text, so it can recover or tell the user. A timed-out tool is abandoned, not cancelled.", { cls: "t s mut" }));
    return out;
  });

// ── 07 · tool map ────────────────────────────────────────────────────────────

svg("07-tools.svg", 1000, 660, "The 13 tools (lib/tools/)",
  "Grouped by job. Badges show what runs alone, what asks first, what calls a model and what sub-agents may use.", () => {
    const groups = [
      [30, 90, "SCREENING", [
        ["screen_cap_table", "warn", ["progress"]],
        ["query_screening_data", "code", ["sub"]],
        ["list_mentioned_startups", "code", ["sub"]],
      ]],
      [515, 90, "DOCUMENTS", [
        ["list_startup_documents", "code", ["sub"]],
        ["search_startup_documents", "code", ["sub", "embed"]],
        ["screen_document_entities", "warn", ["model"]],
        ["generate_document", "warn", ["model"]],
      ]],
      [30, 340, "KNOWLEDGE", [
        ["search_compliance_playbook", "code", ["sub"]],
        ["web_search", "code", ["ask", "net"]],
      ]],
      [515, 340, "ORCHESTRATION", [
        ["update_plan", "code", []],
        ["delegate_task", "code", ["model"]],
        ["list_workflows", "code", []],
        ["read_workflow", "code", []],
      ]],
    ];
    const badges = {
      sub: ["sub-agents", "data"], embed: ["embeddings", "ai"], model: ["calls a model", "ai"],
      ask: ["asks first", "prompt"], net: ["internet", "ext"], progress: ["streams progress", "ui"],
    };
    const out = [];
    for (const [gx, gy, label, tools] of groups) {
      out.push(zone(gx, gy, 455, 230, label));
      tools.forEach(([name, cls, bs], i) => {
        const y = gy + 38 + i * 46;
        out.push(`<rect class="${cls} bx" x="${gx + 16}" y="${y}" width="423" height="38" rx="8"/>`);
        out.push(text(gx + 30, y + 24, name, { cls: "t m mono" }));
        let right = gx + 16 + 423 - 10;
        for (const b of [...bs].reverse()) {
          const [l, c] = badges[b];
          const p = pill(0, 0, l, c);
          right -= p.w;
          out.push(pill(right, y + 9, l, c).svg);
          right -= 6;
        }
        fit(name, 13, right - gx - 46, { mono: true });
      });
    }
    out.push(legend(30, 600, [["code", "read-only · may run in parallel"], ["warn", "not read-only · runs alone"]]));
    out.push(text(30, 630, "Sub-agents get only the five tools marked 'sub-agents': read-only, nothing leaves the machine.", { cls: "t s mut" }));
    return out;
  });

// ── 08 · sub-agents ──────────────────────────────────────────────────────────

svg("08-sub-agents.svg", 1000, 570, "Sub-agents (delegate_task)",
  "The same graph, compiled without a checkpointer, with read-only tools and no output to the screen.", () => [
    box({ x: 330, y: 88, w: 340, h: 64, cls: "ai", title: "Main agent · one round", lines: ["asks for delegate_task × 3, run in parallel"] }),
    line([[500, 152], [500, 184]]),
    line([[180, 184], [820, 184]]),
    lbl(500, 178, "task in  ·  findings out"),
    arrow([[180, 184], [180, 218]], { both: true }),
    arrow([[500, 184], [500, 218]], { both: true }),
    arrow([[820, 184], [820, 218]], { both: true }),
    box({ x: 40, y: 218, w: 280, h: 96, cls: "ai", dashed: true, title: "Sub-agent A", lines: ["'Why is Entity A flagged?'", "no chat history · max 5 rounds"] }),
    box({ x: 360, y: 218, w: 280, h: 96, cls: "ai", dashed: true, title: "Sub-agent B", lines: ["'What does the SHA say about B?'", "no chat history · max 5 rounds"] }),
    box({ x: 680, y: 218, w: 280, h: 96, cls: "ai", dashed: true, title: "Sub-agent C", lines: ["'Our policy for an 85% match?'", "no chat history · max 5 rounds"] }),
    arrow([[180, 314], [180, 360]], { both: true }),
    arrow([[500, 314], [500, 360]], { both: true }),
    arrow([[820, 314], [820, 360]], { both: true }),
    box({ x: 40, y: 360, w: 920, h: 70, title: "Read-only tools only", lines: [
      "query_screening_data · list_mentioned_startups · search_compliance_playbook · list_startup_documents · search_startup_documents"] }),
    box({ x: 40, y: 460, w: 290, h: 76, cls: "ui", title: "Silent", lines: ["no SSE events; only the final", "summary goes back"] }),
    box({ x: 355, y: 460, w: 290, h: 76, cls: "ui", title: "Same ToolContext", lines: ["sees the parent's screening,", "mentions and open startup"] }),
    box({ x: 670, y: 460, w: 290, h: 76, cls: "warn", title: "Can't", lines: ["screen, write documents, search", "the web or delegate again"] }),
  ]);

// ── 09 · approvals ───────────────────────────────────────────────────────────

svg("09-approval.svg", 1100, 680, "Human approval for web_search",
  "LangGraph interrupt() pauses the run; Allow or Deny resumes it. Every answer is audited.", () => {
    const B = 110, S = 330, G = 550, C = 770, A = 990;
    return [
      lifelines([
        { x: B, name: "Browser", cls: "ui" },
        { x: S, name: "Assistant service", cls: "code" },
        { x: G, name: "Agent graph", cls: "ai" },
        { x: C, name: "Checkpointer", cls: "data" },
        { x: A, name: "Audit log", cls: "data" },
      ], 84, 660),
      note(G, 160, 300, "model asks for web_search → askApproval", "prompt"),
      msg(G, C, 196, "interrupt(): save state (thread = runId)"),
      msg(G, S, 232, "needs_approval(runId, calls)", { dash: true }),
      note(S, 268, 230, "remember owner + context"),
      msg(S, B, 304, "SSE: approval_required → ApprovalCard", { dash: true }),
      line([[40, 342], [1060, 342]], true),
      lbl(550, 346, "the user reads the exact query and decides (paused runs kept up to 24 h)"),
      msg(B, S, 384, "POST /chat/runs/:runId/resume { approved }"),
      note(S, 420, 270, "check owner · take the run (only once)"),
      msg(S, A, 456, "record agent_tool_approval (tools, inputs)"),
      msg(S, G, 492, "Command({ resume: { approved } })"),
      msg(C, G, 528, "restore state", { dash: true }),
      note(G, 564, 330, "runTools · a declined call gets 'user declined'"),
      msg(G, B, 604, "stream the rest of the turn · [DONE]", { dash: true }),
    ];
  });

// ── 10 · context across turns ────────────────────────────────────────────────

svg("10-context.svg", 1000, 520, "What the model sees, turn by turn",
  "Within a turn it sees every tool call and result. Across turns only text and state carry over.", () => [
    zone(40, 90, 330, 340, "TURN 1"),
    box({ x: 56, y: 124, w: 298, h: 52, cls: "prompt", title: "System prompt", lines: ["full CSV inside <csv_data>"] }),
    box({ x: 56, y: 186, w: 298, h: 52, cls: "ui", title: "Message text", lines: ["'Screen this cap table'"] }),
    box({ x: 56, y: 248, w: 298, h: 52, title: "Tool call + result", lines: ["screen_cap_table → counts"] }),
    box({ x: 56, y: 310, w: 298, h: 52, cls: "ai", title: "Answer", lines: ["'3 flagged, 2 need review…'"] }),

    arrow([[372, 112], [628, 112]], { label: "carried to the next turn", at: [500, 105] }),
    ...[
      ["data", "message text (both turns)"],
      ["data", "screening result → counts"],
      ["data", "CSV text, only until screened"],
      ["data", "@-mentions, re-resolved"],
      ["data", "open startup id"],
    ].map(([cls, t], i) => box({ x: 390, y: 132 + i * 44, w: 220, h: 36, cls, lines: [t] })),
    box({ x: 390, y: 360, w: 220, h: 54, cls: "warn", title: "Not resent", lines: ["turn 1 tool calls + results"] }),

    zone(630, 90, 330, 340, "TURN 2"),
    box({ x: 646, y: 124, w: 298, h: 52, cls: "prompt", title: "System prompt", lines: ["+ prior screening counts"] }),
    box({ x: 646, y: 186, w: 298, h: 52, cls: "ui", title: "Message text", lines: ["turn 1 text + 'Why is A flagged?'"] }),
    box({ x: 646, y: 248, w: 298, h: 52, title: "Tool call + result", lines: ["query_screening_data → detail"] }),
    box({ x: 646, y: 310, w: 298, h: 52, cls: "ai", title: "Answer", lines: ["cites score, list, path"] }),

    text(40, 462, "Limits: 50 messages · 16 KB per message · CSV 500 KB · tool result 20,000 characters · grid chat 80 rows.", { cls: "t s mut" }),
    text(40, 484, "No summarisation of long chats and no memory across chats.", { cls: "t s mut" }),
  ]);

// ── 11 · RAG ingest ──────────────────────────────────────────────────────────

svg("11-rag-ingest.svg", 1150, 380, "Document ingest (lib/rag/ingestDocument.ts)",
  "Starts in the background after the upload returns. The document is 'processing' until it ends.", () => [
    box({ x: 30, y: 110, w: 140, h: 110, cls: "ui", title: "Upload", lines: ["file saved", "status:", "processing"] }),
    arrow([[170, 165], [200, 165]]),
    box({ x: 200, y: 110, w: 180, h: 110, title: "Parse", lines: ["PDF: one per page", "DOCX / TXT / CSV:", "one block", "no OCR"] }),
    arrow([[380, 165], [410, 165]]),
    box({ x: 410, y: 110, w: 180, h: 110, title: "Chunk", lines: ["each page separately", "≈ 450 words", "67-word overlap"] }),
    arrow([[590, 165], [620, 165]]),
    box({ x: 620, y: 110, w: 180, h: 110, cls: "ai", title: "Embed", lines: ["embedding role", "batches of 16", "none → empty vectors"] }),
    arrow([[800, 165], [830, 165]]),
    box({ x: 830, y: 110, w: 160, h: 110, cls: "data", title: "Store", lines: ["DocChunk rows:", "text · page", "vector"] }),
    arrow([[990, 165], [1010, 165]]),
    box({ x: 1010, y: 110, w: 120, h: 110, cls: "data", title: "Ready", lines: ["status: ready", "chunk count"] }),
    arrow([[290, 220], [290, 280]], { dash: true, label: "no text", at: [298, 254], anchor: "start" }),
    arrow([[500, 220], [500, 280]], { dash: true, label: "no chunks", at: [508, 254], anchor: "start" }),
    arrow([[710, 220], [710, 280]], { dash: true, label: "any failure", at: [718, 254], anchor: "start" }),
    box({ x: 200, y: 280, w: 600, h: 50, cls: "warn", title: "status: error", lines: ["message saved (max 500 characters); shown in the document list"] }),
  ]);

// ── 12 · chunking ────────────────────────────────────────────────────────────

svg("12-chunking.svg", 1000, 400, "How text is chunked (lib/rag/chunkText.ts)",
  "Whole sentences, up to 450 words per chunk, each chunk starting with the previous chunk's last sentences.", () => {
    const widths = [84, 62, 104, 70, 92, 66, 112, 60];
    const S = [];
    let x = 60;
    widths.forEach((w) => { S.push({ x, w }); x += w + 8; });
    const end = (i) => S[i].x + S[i].w;
    const out = [
      zone(40, 90, 760, 230, "PAGE 3"),
      zone(820, 90, 150, 230, "PAGE 4"),
      `<rect class="hl" x="${S[3].x - 4}" y="146" width="${end(4) - S[3].x + 8}" height="130" rx="6"/>`,
    ];
    S.forEach((s, i) => out.push(box({ x: s.x, y: 196, w: s.w, h: 34, title: `S${i + 1}` })));
    out.push(line([[S[0].x, 186], [S[0].x, 176], [end(4), 176], [end(4), 186]]));
    out.push(text((S[0].x + end(4)) / 2, 166, "Chunk 1 · up to 450 words", { cls: "t s", anchor: "middle" }));
    out.push(line([[S[3].x, 240], [S[3].x, 250], [end(7), 250], [end(7), 240]]));
    out.push(text((S[3].x + end(7)) / 2, 270, "Chunk 2 · begins with chunk 1's last sentences (≤ 67 words)", { cls: "t s", anchor: "middle" }));
    out.push(text((S[3].x + end(4)) / 2, 300, "overlap", { cls: "t xs mut", anchor: "middle" }));
    out.push(box({ x: 845, y: 196, w: 100, h: 34, title: "S9" }));
    out.push(line([[845, 186], [845, 176], [945, 176], [945, 186]]));
    out.push(text(895, 166, "Chunk 3", { cls: "t s", anchor: "middle" }));
    out.push(text(895, 270, "new page,", { cls: "t xs mut", anchor: "middle" }));
    out.push(text(895, 286, "new chunk", { cls: "t xs mut", anchor: "middle" }));
    out.push(text(40, 350, "Sentences end at . ! or ? before a capital letter, or at a blank line. A sentence over 450 words becomes its own chunk.", { cls: "t s mut" }));
    out.push(text(40, 372, "Chunks never cross a page, so every excerpt keeps its page number for citations.", { cls: "t s mut" }));
    return out;
  });

// ── 13 · retrieval ───────────────────────────────────────────────────────────

svg("13-rag-retrieval.svg", 1000, 450, "Document search (lib/rag/retrieveChunks.ts)",
  "Vector search when an embedding model is set; keyword search when it isn't or finds nothing.", () => [
    box({ x: 30, y: 172, w: 130, h: 60, cls: "ui", title: "Query", lines: ["from the model"] }),
    arrow([[160, 202], [190, 202]]),
    box({ x: 190, y: 168, w: 160, h: 68, cls: "ui", title: "Embedding", lines: ["model configured?"] }),
    arrow([[350, 190], [372, 190], [372, 133], [400, 133]], { label: "yes", at: [380, 168], anchor: "start" }),
    arrow([[350, 214], [372, 214], [372, 333], [400, 333]], { label: "no", at: [380, 280], anchor: "start" }),

    box({ x: 400, y: 100, w: 160, h: 66, cls: "ai", title: "Embed the query", lines: ["same model as chunks"] }),
    arrow([[560, 133], [585, 133]]),
    box({ x: 585, y: 100, w: 185, h: 66, title: "Exact cosine", lines: ["this startup's chunks", "score = (1 + cos) / 2"] }),
    arrow([[770, 133], [795, 133]]),
    box({ x: 795, y: 100, w: 175, h: 66, title: "Filter", lines: ["score ≥ 0.60", "keep the top 6"] }),
    arrow([[882, 166], [882, 300]], { label: "hits", at: [890, 238], anchor: "start" }),
    arrow([[820, 166], [820, 220], [580, 220], [580, 300]], { label: "no hits", at: [700, 213] }),

    box({ x: 400, y: 300, w: 360, h: 66, title: "Keyword search", lines: ["words > 2 letters · scan up to 300 chunks", "score = share of words found · top 6"] }),
    arrow([[760, 333], [795, 333]]),
    box({ x: 795, y: 300, w: 175, h: 66, cls: "data", title: "Excerpts", lines: ["file · page · relevance %"] }),
    text(30, 410, "Chunks embedded with a different model (different vector length) are skipped. No reranking or hybrid scoring yet.", { cls: "t s mut" }),
  ]);

// ── 14 · CSV ingest ──────────────────────────────────────────────────────────

svg("14-csv-ingest.svg", 1000, 590, "CSV ingest: the model is the last resort",
  "lib/screening/csvIngest.ts tries four code paths before asking the utility model to map columns.", () => {
    const steps = [
      ["code", "1 · Reference-file check", "URLs + dataset metadata, no owners?", "warn", "Rejected with guidance"],
      ["code", "2 · Strict headers", "entity, entity_type, owner, owner_type, ownership_pct", "data", "Cap table"],
      ["code", "3 · Shareholder schedule", "name + % columns, no company column", "data", "Entity roster"],
      ["code", "4 · Known header aliases", "familiar column names mapped to fields", "data", "Cap table or roster"],
    ];
    const out = [];
    steps.forEach(([cls, title, l, ocls, outcome], i) => {
      const y = 92 + i * 80;
      out.push(box({ x: 60, y, w: 540, h: 56, cls, title, lines: [l] }));
      out.push(arrow([[600, y + 28], [680, y + 28]], { label: i === 0 ? "yes" : "match", at: [640, y + 21] }));
      out.push(box({ x: 680, y: y + 6, w: 280, h: 44, cls: ocls, title: outcome }));
      out.push(arrow([[330, y + 56], [330, y + 80]], { label: "no", at: [338, y + 72], anchor: "start" }));
    });
    out.push(box({ x: 60, y: 412, w: 540, h: 62, cls: "ai", title: "5 · Model maps the columns (the only AI step)",
      lines: ["headers + 8 sample rows in <csv_data> → JSON: kind, confidence, mapping"] }));
    out.push(arrow([[600, 443], [680, 443]]));
    out.push(box({ x: 680, y: 412, w: 280, h: 62, title: "Check the answer", lines: ["columns must be real headers", "unknown kind → ignored"] }));
    out.push(arrow([[820, 474], [820, 500]]));
    out.push(box({ x: 680, y: 500, w: 280, h: 44, cls: "data", title: "Cap table · roster · rejected" }));
    out.push(arrow([[330, 474], [330, 500]], { label: "no model, blocked or unsure", at: [338, 492], anchor: "start" }));
    out.push(box({ x: 60, y: 500, w: 540, h: 44, cls: "warn", title: "'Could not map this CSV' + missing fields" }));
    return out;
  });

// ── 15 · providers ───────────────────────────────────────────────────────────

svg("15-providers.svg", 1180, 470, "Models: roles, gate, adapters (lib/llm/providers/)",
  "Every call names a role. getLlm resolves it, enforces local-only mode and returns a cached client.", () => [
    box({ x: 30, y: 96, w: 250, h: 80, cls: "ai", title: "agent", mono: true, lines: ["chat agent · sub-agents"] }),
    box({ x: 30, y: 196, w: 250, h: 80, cls: "ai", title: "utility", mono: true, lines: ["mapping · narratives · extraction", "documents · falls back to agent"] }),
    box({ x: 30, y: 296, w: 250, h: 80, cls: "ai", title: "embedding", mono: true, lines: ["RAG · none → keyword search"] }),
    arrow([[280, 136], [305, 136], [305, 220], [330, 220]]),
    arrow([[280, 236], [330, 236]]),
    arrow([[280, 336], [305, 336], [305, 252], [330, 252]]),

    box({ x: 330, y: 176, w: 180, h: 120, title: "getLlm(role)", mono: true, lines: ["read the config", "pick provider + model", "build client (cached)"] }),
    box({ x: 330, y: 340, w: 180, h: 100, cls: "data", title: "Config", lines: ["AI Control Center", "keys sealed by keychain", "(pnpm dev: env vars)"] }),
    arrow([[420, 340], [420, 296]]),
    arrow([[510, 236], [560, 236]]),

    box({ x: 560, y: 176, w: 180, h: 120, cls: "warn", title: "Local-only gate", lines: ["local-only is on", "and the provider is", "remote → blocked"] }),
    arrow([[740, 236], [765, 236], [765, 140], [790, 140]]),
    arrow([[740, 236], [790, 236]]),
    arrow([[740, 236], [765, 236], [765, 336], [790, 336]]),

    box({ x: 790, y: 100, w: 190, h: 80, title: "Anthropic", lines: ["Messages API, as is"] }),
    box({ x: 790, y: 196, w: 190, h: 80, title: "OpenAI-compatible", lines: ["OpenAI · Gemini · Groq", "OpenRouter · LM Studio"] }),
    box({ x: 790, y: 296, w: 190, h: 80, title: "Ollama (native)", lines: ["context sized to RAM", "thinking split off · t=0.2"] }),

    arrow([[980, 140], [1010, 140]], { orange: true }),
    arrow([[980, 222], [995, 222], [995, 160], [1010, 160]], { orange: true }),
    arrow([[980, 250], [995, 250], [995, 316], [1010, 316]]),
    arrow([[980, 336], [1010, 336]]),
    box({ x: 1010, y: 104, w: 150, h: 76, cls: "ext", title: "Cloud APIs", lines: ["your own keys"] }),
    box({ x: 1010, y: 290, w: 150, h: 76, cls: "data", title: "This computer", lines: ["Ollama · LM Studio", "llama.cpp"] }),
    text(560, 324, "Tool-less model: no tools are sent", { cls: "t xs mut" }),
    text(560, 340, "and the prompt says to answer", { cls: "t xs mut" }),
    text(560, 356, "only from the given context.", { cls: "t xs mut" }),
  ]);

// ── 16 · worked example ──────────────────────────────────────────────────────

svg("16-example.svg", 1100, 530, "Worked example: 'Investigate the flagged entities and draft an IC memo'",
  "One turn, five model calls. Each column is one pass through callModel → runTools.", () => {
    const cols = [
      ["Round 1", "posts a 4-step plan", [["code", "update_plan", "→ plan_updated"]], "Checklist appears"],
      ["Round 2", "2 × delegate_task", [["ai", "delegate_task", "Entity A"], ["ai", "delegate_task", "Entity B"]], "Both run in parallel"],
      ["Round 3", "asks generate_document", [["warn", "generate_document", "IC memo saved"]], "Download card"],
      ["Round 4", "marks steps done", [["code", "update_plan", "4 / 4 done"]], "Checklist ticks off"],
      ["Answer", "writes 2 sentences", [], "Short reply · [DONE]"],
    ];
    const out = [];
    cols.forEach(([round, model, tools, ui], i) => {
      const x = 30 + i * 214;
      out.push(text(x, 100, round, { cls: "zonet" }));
      out.push(box({ x, y: 110, w: 190, h: 60, cls: "ai", title: "Model", lines: [model] }));
      if (tools.length) {
        out.push(arrow([[x + 95, 170], [x + 95, 210]]));
        const h = tools.length === 1 ? 110 : 50;
        tools.forEach(([cls, t, l], j) => out.push(box({ x, y: 210 + j * 60, w: 190, h, cls, title: t, mono: true, lines: [l] })));
        if (i < cols.length - 1) out.push(arrow([[x + 190, 265], [x + 202, 265], [x + 202, 140], [x + 214, 140]]));
      } else {
        out.push(box({ x, y: 210, w: 190, h: 110, cls: "ui", dashed: true, title: "no tool calls", lines: ["content_done", "→ END"] }));
      }
      out.push(arrow([[x + 95, 320], [x + 95, 370]], { dash: true }));
      out.push(box({ x, y: 370, w: 190, h: 54, cls: "ui", title: "User sees", lines: [ui] }));
    });
    out.push(text(30, 470, "Text the model writes in any round streams to the chat as it is written. The sub-agents in round 2 work silently;", { cls: "t s mut" }));
    out.push(text(30, 490, "only their summaries come back. If round 8 were reached, stopAtRoundLimit would end the turn instead.", { cls: "t s mut" }));
    return out;
  });

finish();
