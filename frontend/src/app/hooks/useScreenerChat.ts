"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  resumeChatTurn,
  streamChatMessage,
  type ChatStreamHandlers,
} from "@/app/lib/screenerApi";
import { getStartupChat, saveStartupChat } from "@/lib/startupsApi";
import { createAuditLog } from "@/app/lib/auditLogApi";
import type {
  ScreeningProgressEvent,
  ScreeningResult,
} from "@/lib/screenerTypes";
import type { AssistantEvent, ScreenerMessage } from "@/app/components/screen/chatTypes";

interface UseScreenerChatOptions {
  startupId?: string;
  onDocumentCreated?: (document: {
    id: string;
    startupId: string;
    kind: "ic_memo";
    title: string;
  }) => void;
}

/** What the current assistant message has collected so far (kept across an approval pause). */
type TurnState = {
  toolEvents: AssistantEvent[];
  progress: ScreeningProgressEvent[];
  text: string;
};

const newTurn = (): TurnState => ({ toolEvents: [], progress: [], text: "" });

/** A pending approval the user didn't answer before moving on is retired. */
function skipPendingApprovals(messages: ScreenerMessage[]): ScreenerMessage[] {
  return messages.map((m) =>
    m.events?.some((e) => e.type === "approval_request" && e.status === "pending")
      ? {
          ...m,
          events: m.events.map((e) =>
            e.type === "approval_request" && e.status === "pending" ? { ...e, status: "skipped" as const } : e,
          ),
        }
      : m,
  );
}

export function useScreenerChat({
  startupId,
  onDocumentCreated,
}: UseScreenerChatOptions = {}) {
  const [messages, setMessages] = useState<ScreenerMessage[]>([]);
  const [isResponseLoading, setIsResponseLoading] = useState(false);
  const [chatHydrated, setChatHydrated] = useState(!startupId);
  const [screeningResult, setScreeningResult] =
    useState<ScreeningResult | null>(null);
  const [isScreeningActive, setIsScreeningActive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const csvRef = useRef<string | null>(null);
  const screeningResultRef = useRef<ScreeningResult | null>(null);
  const messagesRef = useRef<ScreenerMessage[]>([]);
  const turnRef = useRef<TurnState>(newTurn());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    screeningResultRef.current = screeningResult;
  }, [screeningResult]);

  useEffect(() => {
    if (!startupId) {
      setChatHydrated(true);
      return;
    }
    setChatHydrated(false);
    getStartupChat(startupId)
      .then(({ messages: stored }) => {
        if (stored.length > 0) {
          setMessages(stored as ScreenerMessage[]);
        }
      })
      .catch(() => {})
      .finally(() => setChatHydrated(true));
  }, [startupId]);

  const persistMessages = useCallback(
    (next: ScreenerMessage[]) => {
      if (!startupId) return;
      saveStartupChat(startupId, next).catch(() => {});
    },
    [startupId],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsResponseLoading(false);
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      const events = (last.events ?? []).map((e) =>
        "isStreaming" in e ? { ...e, isStreaming: false } : e,
      );
      return [...prev.slice(0, -1), { ...last, events }];
    });
  }, []);

  /** Replace the last (assistant) message's events and text. */
  const updateLastAssistant = useCallback(
    (events: AssistantEvent[], content?: string, persist = false) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const updated = [
          ...prev.slice(0, -1),
          { ...last, events, content: content ?? last.content, error: undefined },
        ];
        if (persist) persistMessages(updated);
        return updated;
      });
    },
    [persistMessages],
  );

  /**
   * Streams one agent turn into the last assistant message. Used for a new
   * message and for continuing after an approval, so both render the same way.
   */
  const runTurn = useCallback(
    async (start: (handlers: ChatStreamHandlers, signal: AbortSignal) => Promise<void>) => {
      const turn = turnRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsResponseLoading(true);
      setIsScreeningActive(false);

      const progressEvent = (streaming: boolean): AssistantEvent[] =>
        turn.progress.length > 0
          ? [{ type: "screening_progress", progressHistory: [...turn.progress], isStreaming: streaming }]
          : [];
      const showWorking = () =>
        updateLastAssistant([...turn.toolEvents, ...progressEvent(true), { type: "thinking", isStreaming: true }]);

      try {
        await start(
          {
            onToken: (text) => {
              turn.text += text;
              updateLastAssistant(
                [...turn.toolEvents, ...progressEvent(false), { type: "content", text: turn.text, isStreaming: true }],
                turn.text,
              );
            },
            onToolCall: (name) => {
              turn.toolEvents.push({ type: "tool_call_start", name, isStreaming: false });
              if (name === "screen_cap_table") {
                turn.progress.length = 0;
                setIsScreeningActive(true);
              }
              showWorking();
            },
            onScreeningProgress: (event) => {
              turn.progress.push(event);
              showWorking();
            },
            onDocumentCreated: (document) => {
              turn.toolEvents.push({ type: "document_created", document });
              onDocumentCreated?.(document);
              showWorking();
            },
            onApprovalRequired: (runId, calls) => {
              turn.toolEvents.push({ type: "approval_request", runId, calls, status: "pending" });
            },
            onScreeningResult: (result) => {
              setScreeningResult(result);
              screeningResultRef.current = result;
              setIsScreeningActive(false);
              csvRef.current = null;
              if (startupId) {
                createAuditLog({
                  startupId,
                  eventType: "screening_completed",
                  details: {
                    totalEntities: result.totalEntities,
                    flaggedCount: result.flaggedCount,
                    reviewCount: result.reviewCount,
                    clearCount: result.clearCount,
                  },
                }).catch(() => {});
              }
            },
          },
          controller.signal,
        );

        updateLastAssistant(
          [...turn.toolEvents, ...progressEvent(false), { type: "content", text: turn.text, isStreaming: false }],
          turn.text,
          true,
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages((prev) => {
          const updated = [
            ...prev.slice(0, -1),
            { role: "assistant" as const, content: "", error: msg, events: [{ type: "content" as const, text: msg }] },
          ];
          persistMessages(updated);
          return updated;
        });
      } finally {
        setIsResponseLoading(false);
        setIsScreeningActive(false);
        abortRef.current = null;
      }
    },
    [startupId, persistMessages, onDocumentCreated, updateLastAssistant],
  );

  const handleChat = useCallback(
    async (message: ScreenerMessage, csvContent?: string | null) => {
      if (csvContent) csvRef.current = csvContent;

      const userMsg: ScreenerMessage = {
        role: "user",
        content: message.content,
        files: message.files,
        focus: message.focus,
        workflow: message.workflow,
      };

      setMessages((prev) => [
        ...skipPendingApprovals(prev),
        userMsg,
        {
          role: "assistant",
          content: "",
          events: [{ type: "thinking", isStreaming: true }],
        },
      ]);

      const apiMessages = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" && m.files?.length
            ? `${m.content}\n\n[Attached: ${m.files.map((f) => f.filename).join(", ")}]`
            : m.content,
        focus: m.focus,
        workflow: m.workflow,
      }));

      turnRef.current = newTurn();
      await runTurn((handlers, signal) =>
        streamChatMessage({
          ...handlers,
          messages: apiMessages,
          screeningResult: screeningResultRef.current,
          csvContent: csvContent ?? csvRef.current,
          startupId: startupId ?? null,
          signal,
        }),
      );
      return null;
    },
    [startupId, runTurn],
  );

  /** Allow / Deny a paused tool call, then stream the rest of the answer. */
  const answerApproval = useCallback(
    async (runId: string, approved: boolean) => {
      const status = approved ? ("approved" as const) : ("declined" as const);
      const mark = (e: AssistantEvent): AssistantEvent =>
        e.type === "approval_request" && e.runId === runId ? { ...e, status } : e;
      const turn = turnRef.current;
      turn.toolEvents = turn.toolEvents.map(mark);
      setMessages((prev) => prev.map((m) => (m.events ? { ...m, events: m.events.map(mark) } : m)));
      await runTurn((handlers, signal) => resumeChatTurn(runId, approved, handlers, signal));
    },
    [runTurn],
  );

  const resetChat = useCallback(() => {
    cancel();
    setMessages([]);
    setScreeningResult(null);
    csvRef.current = null;
    if (startupId) {
      saveStartupChat(startupId, []).catch(() => {});
    }
  }, [cancel, startupId]);

  return {
    messages,
    isResponseLoading,
    chatHydrated,
    handleChat,
    answerApproval,
    cancel,
    screeningResult,
    setScreeningResult,
    isScreeningActive,
    resetChat,
  };
}
