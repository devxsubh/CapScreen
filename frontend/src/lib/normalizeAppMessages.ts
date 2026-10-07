import type { AssistantEvent, AppMessage } from "@/app/components/shared/types";

function hasContentEvent(events: AssistantEvent[]): boolean {
    return events.some((e) => e.type === "content" && e.text.trim().length > 0);
}

/** Persisted chat rows should never replay streaming placeholders. */
function finalizePersistedEvent(event: AssistantEvent): AssistantEvent {
    if (event.type === "tool_call_start" || event.type === "thinking") {
        return { ...event, isStreaming: false };
    }
    if ("isStreaming" in event && event.isStreaming) {
        const { isStreaming: _streaming, ...rest } = event;
        return rest as AssistantEvent;
    }
    return event;
}

export function normalizeAppMessage(msg: AppMessage): AppMessage {
    if (msg.role !== "assistant") return msg;

    let events = (msg.events ?? []).map(finalizePersistedEvent);
    const text = msg.content?.trim();

    if (text && !hasContentEvent(events)) {
        events = [...events, { type: "content", text }];
    }

    return events.length > 0 || text
        ? { ...msg, events }
        : msg;
}

export function normalizeAppMessages(messages: AppMessage[]): AppMessage[] {
    return messages.map(normalizeAppMessage);
}
