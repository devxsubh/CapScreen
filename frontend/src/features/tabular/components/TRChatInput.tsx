/** Message box for the tabular review chat. */

import { useEffect, useRef, useState } from "react";
import { Square, ArrowRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function TRChatInput({
    isLoading,
    onSubmit,
    onCancel,
    onHeightChange,
}: {
    isLoading: boolean;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    onHeightChange: (height: number) => void;
}) {
    const [value, setValue] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const notify = () => {
            onHeightChange(root.getBoundingClientRect().height);
        };
        notify();

        const observer = new ResizeObserver(notify);
        observer.observe(root);
        window.addEventListener("resize", notify);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", notify);
        };
    }, [onHeightChange]);

    function resizeTextarea(el: HTMLTextAreaElement) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
        el.style.overflowY = el.scrollHeight > 192 ? "auto" : "hidden";
    }

    function resetTextarea() {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.overflowY = "hidden";
    }

    function handleAction() {
        if (isLoading) {
            onCancel();
            return;
        }
        const trimmed = value.trim();
        if (!trimmed) return;
        setValue("");
        resetTextarea();
        onSubmit(trimmed);
    }

    return (
        <div
            ref={rootRef}
            className="absolute bottom-0 left-0 right-0 px-4 pb-4 bg-white"
        >
            <div className="border border-gray-300 rounded-xl bg-white pt-2 pb-1.5 flex flex-col gap-1">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder="Ask a question about your documents..."
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        resizeTextarea(e.target);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAction();
                        }
                    }}
                    className="w-full resize-none text-sm bg-transparent outline-none placeholder:text-gray-400 leading-6 max-h-48 overflow-hidden border-0 p-0 pl-3 pr-2 pt-0.5"
                />
                <div className="flex items-center justify-end pl-1 pr-2">
                    <button
                        type="button"
                        onClick={handleAction}
                        disabled={!isLoading && !value.trim()}
                        className="relative bg-gray-950 hover:bg-gray-800 text-white rounded-full h-7 w-7 shrink-0 flex items-center justify-center disabled:cursor-default disabled:bg-gray-300 active:enabled:scale-95 transition-all duration-150"
                    >
                        {isLoading ? (
                            <Square
                                className="h-3.5 w-3.5"
                                fill="currentColor"
                                strokeWidth={0}
                            />
                        ) : (
                            <ArrowRight className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
