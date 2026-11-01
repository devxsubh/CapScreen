/** Small pieces of the chat input: the tools menu, quick actions, attachment chips. */

import { Check, X, type LucideIcon } from "lucide-react";
import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FOCUS_ICON } from "@/features/assistant/lib/focusIcons";
import { CHAT_FOCUS, CHAT_FOCUS_ORDER, type ChatFocus } from "@/lib/chatFocus";

export function ToolsMenu({ focus, onToggle }: { focus: ChatFocus | null; onToggle: (f: ChatFocus) => void }) {
    return (
        <DropdownMenuContent align="start" className="w-72 rounded-xl bg-white p-1.5">
            <div className="px-3 pb-1 pt-2">
                <p className="text-sm font-medium text-gray-900">AI tools</p>
                <p className="mt-0.5 text-xs text-gray-500">Change what the assistant focuses on without leaving the chat.</p>
            </div>
            {CHAT_FOCUS_ORDER.map((f) => {
                const Icon = FOCUS_ICON[f];
                return (
                    <DropdownMenuItem key={f} className="cursor-pointer items-start gap-3 rounded-lg px-3 py-2" onSelect={() => onToggle(f)}>
                        <Icon className="mt-0.5 h-4 w-4 text-gray-500" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm text-gray-900">{CHAT_FOCUS[f].label}</span>
                            <span className="block text-xs text-gray-500">{CHAT_FOCUS[f].description}</span>
                        </span>
                        {focus === f && <Check className="mt-0.5 h-4 w-4 text-gray-900" />}
                    </DropdownMenuItem>
                );
            })}
        </DropdownMenuContent>
    );
}

export function QuickAction({
    icon: Icon,
    label,
    active,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`group inline-flex h-9 max-w-60 items-center gap-2 rounded-xl border bg-white pl-1.5 pr-3 text-[13px] shadow-sm transition-colors ${
                active
                    ? "border-gray-400 bg-gray-50 text-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
        >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{label}</span>
            {active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-gray-900" />
            ) : (
                <span aria-hidden className="text-sm leading-none text-gray-400 transition-colors group-hover:text-gray-900">
                    +
                </span>
            )}
        </button>
    );
}

export function AttachmentChip({ icon, name, onRemove }: { icon: React.ReactNode; name: string; onRemove: () => void }) {
    return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1 pl-2 pr-1 text-xs text-gray-700 shadow-sm">
            {icon}
            <span className="max-w-[160px] truncate">{name}</span>
            <button
                type="button"
                onClick={onRemove}
                className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
                aria-label={`Remove ${name}`}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

export function Divider() {
    return <span aria-hidden className="mx-1 h-5 w-px shrink-0 self-center rounded-full bg-gray-300/80" />;
}
