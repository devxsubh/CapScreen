"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { CapScreenIcon } from "@/components/chat/capscreen-icon";
import { ChatMarkdown } from "@/app/components/shared/ChatMarkdown";
import { PreResponseWrapper } from "@/app/components/shared/PreResponseWrapper";
import { IcMemoDownloadCard } from "@/app/components/startups/IcMemoDownloadCard";
import { TOOL_LABELS } from "@/app/lib/screenerApi";
import { ScreeningProgressSteps } from "./ScreeningProgressSteps";
import { parseMessageOptions } from "@/lib/parseMessageOptions";
import { MessageOptionChips } from "@/app/components/shared/MessageOptionChips";
import type { AssistantEvent } from "./chatTypes";

function toolCallLabel(name: string): string {
  return TOOL_LABELS[name] ?? (name ? `Running ${name}…` : "Working…");
}

type StatusState = "active" | "error" | null;

function ResponseStatus({ status }: { status: StatusState }) {
  const [showDone, setShowDone] = useState(false);
  const [doneVisible, setDoneVisible] = useState(false);
  const wasActiveRef = useRef(false);
  const isActive = status === "active";
  const isError = status === "error";

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setShowDone(true);
      setDoneVisible(true);
      const t = setTimeout(() => setDoneVisible(false), 1500);
      return () => clearTimeout(t);
    } else if (!wasActiveRef.current && isActive) {
      setShowDone(false);
      setDoneVisible(false);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  return (
    <div className="w-full h-9 flex items-center mb-2">
      <CapScreenIcon
        spin={isActive}
        done={showDone && doneVisible}
        error={isError}
        brand={!isError && !(showDone && doneVisible)}
        size={22}
      />
    </div>
  );
}

interface Props {
  content: string;
  events?: AssistantEvent[];
  isStreaming: boolean;
  isError?: boolean;
  minHeight?: string;
  startupId?: string;
  showOptionChips?: boolean;
  onOptionSelect?: (value: string) => void;
}

export function ScreenerAssistantMessage({
  content,
  events,
  isStreaming,
  isError,
  minHeight = "0px",
  startupId,
  showOptionChips = false,
  onOptionSelect,
}: Props) {
  const status: StatusState = isError ? "error" : isStreaming ? "active" : null;

  type EventGroup =
    | { kind: "pre"; events: AssistantEvent[]; indices: number[] }
    | {
        kind: "document";
        event: Extract<AssistantEvent, { type: "document_created" }>;
        index: number;
      }
    | {
        kind: "content";
        event: Extract<AssistantEvent, { type: "content" }>;
        index: number;
      };

  const groups: EventGroup[] = [];
  if (events) {
    let current: Extract<EventGroup, { kind: "pre" }> | null = null;
    const flushPre = () => {
      if (current) {
        groups.push(current);
        current = null;
      }
    };
    events.forEach((e, i) => {
      if (e.type === "content") {
        flushPre();
        groups.push({ kind: "content", event: e, index: i });
      } else if (e.type === "document_created") {
        flushPre();
        groups.push({ kind: "document", event: e, index: i });
      } else {
        if (!current) current = { kind: "pre", events: [], indices: [] };
        current.events.push(e);
        current.indices.push(i);
      }
    });
    flushPre();
  }

  const hasContentAfter = (groupIdx: number): boolean => {
    for (let i = groupIdx + 1; i < groups.length; i++) {
      const g = groups[i];
      if (g.kind === "document") return true;
      if (g.kind === "content" && g.event.text.length > 0) return true;
    }
    return false;
  };

  const renderPreEvent = (
    event: AssistantEvent,
    i: number,
    allEvents: AssistantEvent[],
    globalIdx: number,
  ) => {
    const nextEvent = allEvents[i + 1];
    const showConnector =
      nextEvent !== undefined && nextEvent.type !== "content";

    if (event.type === "tool_call_start") {
      return (
        <div
          key={globalIdx}
          className="flex items-center text-sm font-serif text-gray-500 relative"
        >
          {showConnector && (
            <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
          )}
          <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
          <span className="font-medium ml-2">{toolCallLabel(event.name)}</span>
        </div>
      );
    }
    if (event.type === "screening_progress") {
      return (
        <div key={globalIdx} className="w-full">
          <ScreeningProgressSteps
            events={event.progressHistory}
            isStreaming={!!event.isStreaming || isStreaming}
          />
        </div>
      );
    }
    if (event.type === "thinking") {
      return (
        <div
          key={globalIdx}
          className="flex items-center text-sm font-serif text-gray-500 relative"
        >
          {showConnector && (
            <div className="absolute bottom-0 w-[1px] bg-gray-300 top-[13px] left-[2.5px] h-[calc(100%+11px)]" />
          )}
          <div className="w-1.5 h-1.5 rounded-full border border-gray-400 border-t-transparent animate-spin shrink-0" />
          <span className="ml-2">Thinking…</span>
        </div>
      );
    }
    return null;
  };

  const displayContent = content || (isError ? "" : "");

  const lastContentIndex =
    events?.reduce(
      (last, event, idx) => (event.type === "content" ? idx : last),
      -1,
    ) ?? -1;

  const lastContentText =
    lastContentIndex >= 0 && events?.[lastContentIndex]?.type === "content"
      ? events[lastContentIndex].text
      : displayContent;

  const messageOptions =
    showOptionChips && !isStreaming && !isError
      ? parseMessageOptions(lastContentText)
      : null;

  function renderContentText(text: string, index: number) {
    const markdownText =
      index === lastContentIndex && messageOptions
        ? messageOptions.displayText
        : text;

    return (
      <>
        <ChatMarkdown text={markdownText} className="mb-4" />
        {index === lastContentIndex &&
          messageOptions &&
          onOptionSelect && (
            <MessageOptionChips
              options={messageOptions.options}
              onSelect={onOptionSelect}
              disabled={isStreaming}
            />
          )}
      </>
    );
  }

  return (
    <div style={{ minHeight }}>
      <ResponseStatus status={status} />
      <div className="w-full font-inter relative mt-2">
        {events && events.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groups.map((g, gIdx) => {
              if (g.kind === "content") {
                return (
                  <div key={`c-${g.index}`}>
                    {renderContentText(g.event.text, g.index)}
                  </div>
                );
              }
              if (g.kind === "document") {
                const docStartupId = startupId ?? g.event.document.startupId;
                if (g.event.document.kind === "ic_memo" && docStartupId) {
                  return (
                    <IcMemoDownloadCard
                      key={`d-${g.index}`}
                      startupId={docStartupId}
                      documentId={g.event.document.id}
                      title={g.event.document.title}
                    />
                  );
                }
                return (
                  <div
                    key={`d-${g.index}`}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-600" />
                    <span>
                      Saved{" "}
                      <span className="font-medium">{g.event.document.title}</span>
                    </span>
                  </div>
                );
              }
              const subsequentContent = hasContentAfter(gIdx);
              const wrapperIsStreaming = g.events.some(
                (event) => "isStreaming" in event && !!event.isStreaming,
              );
              return (
                <PreResponseWrapper
                  key={`p-${g.indices[0]}`}
                  stepCount={g.events.length}
                  shouldMinimize={subsequentContent}
                  isStreaming={wrapperIsStreaming || isStreaming}
                >
                  {g.events.map((event, i) =>
                    renderPreEvent(event, i, g.events, g.indices[i]),
                  )}
                </PreResponseWrapper>
              );
            })}
          </div>
        ) : (
          <>
            {renderContentText(displayContent, lastContentIndex)}
          </>
        )}
        {isError && (
          <p className="text-sm text-red-600 mt-2">{displayContent}</p>
        )}
      </div>
    </div>
  );
}
