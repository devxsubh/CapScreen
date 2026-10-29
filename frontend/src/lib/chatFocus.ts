/**
 * Chat focus: a capability picked from the composer's Tools menu. Sent with the user's message;
 * the backend adds a matching instruction to the agent's system prompt (routes/assistantChat.ts).
 */
export type ChatFocus = "screen" | "review" | "ownership" | "research" | "memo";

export const CHAT_FOCUS: Record<ChatFocus, { label: string; description: string }> = {
    screen: { label: "Sanctions screen", description: "Screen a cap table against the sanctions lists" },
    review: { label: "Review matches", description: "Explain flagged and review entities" },
    ownership: { label: "Ownership trace", description: "Follow chains to the ultimate beneficial owners" },
    research: { label: "Web research", description: "Public news, adverse media, sanctions updates" },
    memo: { label: "Draft memo", description: "IC memo or AML summary from the results" },
};

export const CHAT_FOCUS_ORDER: ChatFocus[] = ["screen", "review", "ownership", "research", "memo"];

export function isChatFocus(value: unknown): value is ChatFocus {
    return typeof value === "string" && value in CHAT_FOCUS;
}
