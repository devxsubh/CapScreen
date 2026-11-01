"use client";

import { useEffect, useRef, useState } from "react";
import { X, Clock, MessageSquarePlus, Trash2 } from "lucide-react";
import { CapScreenIcon } from "@/components/chat/CapScreenIcon";
import { streamTabularChat, getTabularChats, getTabularChatMessages, deleteTabularChat, mapTRMessages, type TRChat } from "@/api/tabularReviews";
import type { AssistantEvent, ColumnConfig, AppDocument } from "@/types/app";
import { TRChatInput } from "./TRChatInput";
import { TRChatHistoryDropdown } from "./TRChatHistoryDropdown";
import { MessageBubble, type TRMessage } from "./TRAssistantMessage";

interface Props {
    reviewId: string;
    reviewTitle?: string | null;
    projectName?: string | null;
    columns: ColumnConfig[];
    documents: AppDocument[];
    onCitationClick: (colIdx: number, rowIdx: number) => void;
    onClose: () => void;
    initialChatId?: string | null;
    onChatIdChange?: (chatId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Drip helpers
// ---------------------------------------------------------------------------

function findLastContentIndex(events: AssistantEvent[]): number {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === "content") return i;
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TRChatPanel({
    reviewId,
    reviewTitle,
    projectName,
    columns: _columns,
    documents: _documents,
    onCitationClick,
    onClose,
    initialChatId,
    onChatIdChange,
}: Props) {
    const [chats, setChats] = useState<TRChat[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(
        initialChatId ?? null,
    );
    const [currentChatTitle, setCurrentChatTitle] = useState<string | null>(
        null,
    );
    const [messages, setMessages] = useState<TRMessage[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [minHeight, setMinHeight] = useState("0px");
    const [messagesVisible, setMessagesVisible] = useState(false);
    const [panelWidth, setPanelWidth] = useState(380);
    const [isResizing, setIsResizing] = useState(false);
    const [inputHeight, setInputHeight] = useState(96);

    useEffect(() => {
        if (!isResizing) return;
        const MIN_WIDTH = 280;
        const MAX_WIDTH = 800;
        function onMove(e: MouseEvent) {
            setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
        }
        function onUp() {
            setIsResizing(false);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing]);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const latestUserMessageRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const historyRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    // Drip animation refs
    const dripIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const dripTargetRef = useRef<string>("");
    const dripDisplayLenRef = useRef<number>(0);
    const eventsRef = useRef<AssistantEvent[]>([]);
    const DRIP_CHARS = 8;

    // Load existing chats from DB on mount
    useEffect(() => {
        getTabularChats(reviewId)
            .then(setChats)
            .catch(() => {});
    }, [reviewId]);

    // Load messages for an initial chat id (e.g. from URL)
    useEffect(() => {
        if (!initialChatId) return;
        setIsLoadingMessages(true);
        getTabularChatMessages(reviewId, initialChatId)
            .then((raw) => setMessages(mapTRMessages(raw) as TRMessage[]))
            .catch(() => {})
            .finally(() => setIsLoadingMessages(false));
    }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fill in title once chats list arrives
    useEffect(() => {
        if (currentChatId && !currentChatTitle) {
            const chat = chats.find((c) => c.id === currentChatId);
            if (chat) setCurrentChatTitle(chat.title ?? null);
        }
    }, [chats, currentChatId, currentChatTitle]);

    // Emit currentChatId changes to parent
    const onChatIdChangeRef = useRef(onChatIdChange);
    useEffect(() => {
        onChatIdChangeRef.current = onChatIdChange;
    });
    useEffect(() => {
        onChatIdChangeRef.current?.(currentChatId);
    }, [currentChatId]);

    useEffect(() => {
        if (messages.length === 0) {
            hasScrolledRef.current = false;
            setMessagesVisible(false);
        } else if (!hasScrolledRef.current) {
            const userMsgCount = messages.filter(
                (m) => m.role === "user",
            ).length;
            if (
                userMsgCount >= 2 &&
                latestUserMessageRef.current &&
                messagesContainerRef.current
            ) {
                setTimeout(() => {
                    const container = messagesContainerRef.current;
                    const element = latestUserMessageRef.current;
                    if (container && element) {
                        container.scrollTo({
                            top: element.offsetTop - 44,
                            behavior: "instant",
                        });
                    }
                    hasScrolledRef.current = true;
                    setMessagesVisible(true);
                }, 100);
            } else {
                hasScrolledRef.current = true;
                setMessagesVisible(true);
            }
        }
    }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const userEl = latestUserMessageRef.current;
        const containerEl = messagesContainerRef.current;
        if (!userEl || !containerEl) return;
        const BOTTOM_PAD = 96;
        const messageContainerTopPadding = 16;
        const messageGap = 16;
        setMinHeight(
            `${Math.max(0, containerEl.clientHeight - BOTTOM_PAD - userEl.offsetHeight - messageContainerTopPadding - messageGap)}px`,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length]);

    useEffect(() => {
        if (!historyOpen) return;
        function handleClick(e: MouseEvent) {
            if (
                historyRef.current &&
                !historyRef.current.contains(e.target as Node)
            ) {
                setHistoryOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [historyOpen]);

    // ---- drip ----

    function stopDrip() {
        if (dripIntervalRef.current !== null) {
            clearInterval(dripIntervalRef.current);
            dripIntervalRef.current = null;
        }
    }

    function updateLastContentEvent(
        prev: TRMessage[],
        text: string,
        isStreaming?: boolean,
    ): TRMessage[] {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role !== "assistant") return prev;
        const evts = last.events ?? [];
        const idx = findLastContentIndex(evts);
        if (idx < 0) return prev;
        const newEvents = [...evts];
        newEvents[idx] = isStreaming
            ? { type: "content", text, isStreaming: true }
            : { type: "content", text };
        updated[updated.length - 1] = { ...last, events: newEvents };
        return updated;
    }

    // Mirror the dripped content text onto eventsRef.current so that any
    // subsequent setMessages built from a refsnapshot (pushEvent,
    // updateMatchingEvent, reasoning_*, etc.) doesn't wipe out the content
    // by replacing it with the stale empty placeholder.
    function syncDripIntoEventsRef(text: string, isStreaming: boolean) {
        const evts = eventsRef.current;
        const idx = findLastContentIndex(evts);
        if (idx < 0) return;
        const newEvents = [...evts];
        newEvents[idx] = isStreaming
            ? { type: "content", text, isStreaming: true }
            : { type: "content", text };
        eventsRef.current = newEvents;
    }

    function flushDrip() {
        stopDrip();
        const target = dripTargetRef.current;
        dripDisplayLenRef.current = target.length;
        syncDripIntoEventsRef(target, false);
        setMessages((prev) => updateLastContentEvent(prev, target));
    }

    function startDrip() {
        if (dripIntervalRef.current !== null) return;
        dripIntervalRef.current = setInterval(() => {
            const target = dripTargetRef.current;
            const displayLen = dripDisplayLenRef.current;
            if (displayLen >= target.length) return;
            const newLen = Math.min(displayLen + DRIP_CHARS, target.length);
            dripDisplayLenRef.current = newLen;
            const slice = target.slice(0, newLen);
            syncDripIntoEventsRef(slice, true);
            setMessages((prev) => updateLastContentEvent(prev, slice, true));
        }, 16);
    }

    // ---- event helpers ----

    // Transient placeholder events that bridge the gap between real SSE
    // events so the PreResponseWrapper doesn't briefly flip to "Completed"
    // when one block ends before the next starts. Anytime a real event
    // arrives (or content begins streaming), drop them first.
    function isStreamingPlaceholder(e: AssistantEvent) {
        return e.type === "thinking" && !!e.isStreaming;
    }

    function clearStreamingPlaceholders() {
        const before = eventsRef.current;
        const after = before.filter((e) => !isStreamingPlaceholder(e));
        if (after.length === before.length) return;
        eventsRef.current = after;
        const snapshot = [...after];
        setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, events: snapshot };
            }
            return updated;
        });
    }

    // ---- chat actions ----

    function handleNewChat() {
        setCurrentChatId(null);
        setCurrentChatTitle(null);
        setMessages([]);
        setHistoryOpen(false);
    }

    async function handleDeleteChat() {
        if (!currentChatId) return;
        const chatIdToDelete = currentChatId;
        setChats((prev) => prev.filter((c) => c.id !== chatIdToDelete));
        setCurrentChatId(null);
        setCurrentChatTitle(null);
        setMessages([]);
        try {
            await deleteTabularChat(reviewId, chatIdToDelete);
        } catch {
            /* ignore */
        }
    }

    async function handleLoadChat(chatId: string) {
        const chat = chats.find((c) => c.id === chatId);
        setCurrentChatId(chatId);
        setCurrentChatTitle(chat?.title ?? null);
        setMessages([]);
        setHistoryOpen(false);
        setIsLoadingMessages(true);
        try {
            const raw = await getTabularChatMessages(reviewId, chatId);
            setMessages(mapTRMessages(raw) as TRMessage[]);
        } catch {
            /* ignore */
        } finally {
            setIsLoadingMessages(false);
        }
    }

    function handleCancel() {
        abortRef.current?.abort();
    }

    async function handleSubmit(trimmed: string) {
        if (!trimmed || isLoading) return;

        // Build messages array for backend (plain text history)
        const history: { role: string; content: string }[] = messages.map(
            (m) => ({
                role: m.role,
                content: m.content,
            }),
        );
        const allMessages = [...history, { role: "user", content: trimmed }];

        const userMsg: TRMessage = { role: "user", content: trimmed };
        const assistantMsg: TRMessage = {
            role: "assistant",
            content: "",
            events: [],
            isStreaming: true,
        };

        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setIsLoading(true);

        setTimeout(() => {
            const container = messagesContainerRef.current;
            const element = latestUserMessageRef.current;
            if (container && element) {
                container.scrollTo({
                    top: element.offsetTop - 44,
                    behavior: "smooth",
                });
            }
        }, 50);

        stopDrip();
        dripTargetRef.current = "";
        dripDisplayLenRef.current = 0;
        eventsRef.current = [];

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await streamTabularChat(
                reviewId,
                allMessages,
                currentChatId,
                controller.signal,
                { reviewTitle, projectName },
            );
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(
                    (payload as { detail?: string } | null)?.detail ??
                        `Chat failed (${response.status})`,
                );
            }
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const dataStr = line.slice(5).trim();
                    if (dataStr === "[DONE]") continue;

                    try {
                        const data = JSON.parse(dataStr);

                        if (data.type === "chat_id") {
                            const newId = data.chatId as string;
                            setCurrentChatId(newId);
                            setChats((prev) =>
                                prev.some((c) => c.id === newId)
                                    ? prev
                                    : [
                                          {
                                              id: newId,
                                              title: null,
                                              created_at:
                                                  new Date().toISOString(),
                                              updated_at:
                                                  new Date().toISOString(),
                                          },
                                          ...prev,
                                      ],
                            );
                            continue;
                        }

                        if (data.type === "content_delta") {
                            const text = data.text as string;
                            dripTargetRef.current += text;
                            const events = eventsRef.current;
                            const lastEvent = events[events.length - 1];
                            if (
                                lastEvent?.type !== "content" ||
                                !lastEvent.isStreaming
                            ) {
                                // Drop bridging placeholders so the wrapper
                                // transitions cleanly into content.
                                eventsRef.current = [
                                    ...events.filter((e) => !isStreamingPlaceholder(e)),
                                    {
                                        type: "content" as const,
                                        text: "",
                                        isStreaming: true,
                                    },
                                ];
                                const snapshot = [...eventsRef.current];
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    const last = updated[updated.length - 1];
                                    if (last?.role === "assistant") {
                                        updated[updated.length - 1] = {
                                            ...last,
                                            events: snapshot,
                                        };
                                    }
                                    return updated;
                                });
                            }
                            startDrip();
                            continue;
                        }

                    } catch {
                        /* skip malformed */
                    }
                }
            }

            flushDrip();
            clearStreamingPlaceholders();
            setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                        ...last,
                        isStreaming: false,
                    };
                }
                return updated;
            });
        } catch (err: unknown) {
            const isAbort = err instanceof Error && err.name === "AbortError";
            stopDrip();
            clearStreamingPlaceholders();
            setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                    const hasContent = (last.events ?? []).some(
                        (e) =>
                            e.type === "content" &&
                            (e as { type: "content"; text: string }).text,
                    );
                    if (!hasContent) {
                        updated[updated.length - 1] = {
                            ...last,
                            isStreaming: false,
                            events: [
                                ...(last.events ?? []),
                                {
                                    type: "content" as const,
                                    text: isAbort
                                        ? ""
                                        : "An error occurred. Please try again.",
                                },
                            ],
                        };
                    } else {
                        updated[updated.length - 1] = {
                            ...last,
                            isStreaming: false,
                        };
                    }
                }
                return updated;
            });
        } finally {
            setIsLoading(false);
            abortRef.current = null;
        }
    }

    // ---- render ----

    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    const lastAssistantIdx = messages
        .map((m) => m.role)
        .lastIndexOf("assistant");

    return (
        <div
            style={{ width: panelWidth }}
            className="shrink-0 flex flex-col border-r border-gray-200 bg-white h-full relative"
        >
            {/* Resize handle */}
            <div
                onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                }}
                className={`absolute top-0 right-0 h-full w-1 cursor-col-resize z-20 transition-colors ${
                    isResizing
                        ? "bg-gray-400"
                        : "bg-transparent hover:bg-gray-300"
                }`}
            />
            {/* Header */}
            <div className="flex items-center justify-between h-8 px-2 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-1.5 px-2 min-w-0">
                    <CapScreenIcon brand size={14} />
                    <div
                        onMouseEnter={(e) => {
                            const el = e.currentTarget;
                            const overflow = el.scrollWidth - el.clientWidth;
                            if (overflow > 0)
                                el.scrollTo({
                                    left: overflow,
                                    behavior: "smooth",
                                });
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.scrollTo({
                                left: 0,
                                behavior: "smooth",
                            });
                        }}
                        className="min-w-0 overflow-x-hidden whitespace-nowrap scrollbar-none"
                    >
                        <span className="text-xs font-medium text-gray-700">
                            {currentChatTitle ?? "Assistant"}
                        </span>
                    </div>
                </div>
                <div className="flex items-center">
                    <div ref={historyRef} className="relative">
                        <button
                            onClick={() => setHistoryOpen((v) => !v)}
                            title="Chat history"
                            className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${historyOpen ? "text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
                        >
                            <Clock className="h-3.5 w-3.5" />
                        </button>
                        {historyOpen && (
                            <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border border-gray-100 bg-white shadow-lg z-50 overflow-hidden">
                                <TRChatHistoryDropdown
                                    chats={chats}
                                    currentChatId={currentChatId}
                                    onLoad={handleLoadChat}
                                />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleNewChat}
                        title="New chat"
                        className="flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                    </button>
                    {currentChatId && (
                        <button
                            onClick={handleDeleteChat}
                            title="Delete chat"
                            className="flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-red-600 transition-colors"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        title="Close"
                        className="flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-4 pt-4 flex flex-col"
                style={{ paddingBottom: Math.ceil(inputHeight + 16) }}
            >
                {messages.length === 0 && !isLoadingMessages && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2">
                        <CapScreenIcon size={24} />
                        <p className="text-sm text-gray-400 text-center">
                            Ask a question about this tabular review.
                        </p>
                    </div>
                )}
                {isLoadingMessages && (
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-end">
                            <div className="bg-gray-100 rounded-2xl p-3 w-3/5">
                                <div className="h-3 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite] rounded w-full" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className={`h-3 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite] rounded ${i === 3 ? "w-5/6" : i === 4 ? "w-4/6" : "w-full"}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {messages.length > 0 && (
                    <div
                        className="flex flex-col gap-4 transition-opacity duration-150"
                        style={{ opacity: messagesVisible ? 1 : 0 }}
                    >
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                ref={
                                    i === lastUserIdx
                                        ? latestUserMessageRef
                                        : null
                                }
                                style={
                                    i === lastAssistantIdx
                                        ? { minHeight }
                                        : undefined
                                }
                            >
                                <MessageBubble
                                    msg={msg}
                                    onCitationClick={onCitationClick}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Input */}
            <TRChatInput
                isLoading={isLoading}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                onHeightChange={setInputHeight}
            />
        </div>
    );
}
