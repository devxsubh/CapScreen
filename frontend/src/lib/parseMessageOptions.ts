export interface MessageOption {
    id: string;
    label: string;
    value: string;
}

export interface ParsedMessageOptions {
    /** Message text with the numbered option block (and redundant outro) removed. */
    displayText: string;
    options: MessageOption[];
}

const REDUNDANT_OUTRO =
    /^(just let me know|let me know|what would you like|tell me (which|what)|choose one|pick one|select an option)/i;

function stripMarkdownInline(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/_(.+?)_/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .trim();
}

function isNumberedOptionLine(line: string): { num: number; text: string } | null {
    const m = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (!m) return null;
    return { num: parseInt(m[1], 10), text: m[2] };
}

/**
 * Detects a trailing numbered list (2–6 items) and converts it to MCQ options.
 * Used when the assistant offers choices like "1. Screen it now … 2. Ask a question …".
 */
export function parseMessageOptions(text: string): ParsedMessageOptions | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const lines = trimmed.split("\n");
    const collected: { num: number; raw: string; lineIndex: number }[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim()) {
            if (collected.length > 0) break;
            continue;
        }

        const parsed = isNumberedOptionLine(line);
        if (!parsed) {
            if (collected.length > 0) break;
            continue;
        }

        collected.unshift({
            num: parsed.num,
            raw: parsed.text,
            lineIndex: i,
        });
    }

    if (collected.length < 2 || collected.length > 6) return null;

    for (let i = 0; i < collected.length; i++) {
        if (collected[i].num !== i + 1) return null;
    }

    const blockStart = collected[0].lineIndex;
    const blockEnd = collected[collected.length - 1].lineIndex;

    const before = lines.slice(0, blockStart);
    const after = lines.slice(blockEnd + 1);

    while (
        after.length > 0 &&
        (after[after.length - 1].trim() === "" ||
            REDUNDANT_OUTRO.test(after[after.length - 1].trim()))
    ) {
        after.pop();
    }

    const displayText = [...before, ...after].join("\n").trim();
    if (!displayText) return null;

    const options: MessageOption[] = collected.map((item, index) => {
        const label = stripMarkdownInline(item.raw);
        return {
            id: String(index + 1),
            label,
            value: label,
        };
    });

    return { displayText, options };
}

export function shouldShowMessageOptions(
    messageIndex: number,
    messages: Array<{ role: string }>,
    isResponseLoading: boolean,
): boolean {
    if (isResponseLoading) return false;
    if (messageIndex !== messages.length - 1) return false;
    if (messages[messageIndex]?.role !== "assistant") return false;
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    return messageIndex > lastUserIndex;
}
