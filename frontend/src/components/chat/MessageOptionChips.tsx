"use client";

import { useState } from "react";
import type { MessageOption } from "@/lib/parseMessageOptions";

interface Props {
    options: MessageOption[];
    onSelect: (value: string) => void;
    disabled?: boolean;
}

export function MessageOptionChips({ options, onSelect, disabled }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    return (
        <div
            className="mt-3 mb-1 flex flex-col gap-2"
            role="group"
            aria-label="Suggested replies"
        >
            {options.map((opt) => {
                const isSelected = selectedId === opt.id;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        disabled={disabled || selectedId !== null}
                        onClick={() => {
                            setSelectedId(opt.id);
                            onSelect(opt.value);
                        }}
                        className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                            isSelected
                                ? "border-gray-900 bg-gray-50 text-gray-900"
                                : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        <span className="mr-2 font-medium text-gray-400">
                            {opt.id}.
                        </span>
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
