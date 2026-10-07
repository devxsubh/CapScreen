import type { AppMessage } from "@/app/components/shared/types";
import type { ScreeningResult } from "@/lib/screenerTypes";

/** Latest persisted screening payload from assistant message events. */
export function latestScreeningFromMessages(
  messages: AppMessage[],
): ScreeningResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.events?.length) continue;
    for (let j = msg.events.length - 1; j >= 0; j--) {
      const ev = msg.events[j];
      if (
        ev.type === "screening_complete" &&
        !ev.isStreaming &&
        ev.result &&
        Array.isArray(ev.result.entities)
      ) {
        return ev.result;
      }
    }
  }
  return null;
}
