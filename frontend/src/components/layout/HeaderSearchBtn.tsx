"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface Props {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}

export function HeaderSearchBtn({ value, onChange, placeholder = "Search…" }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                onChange("");
            }
        }
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open, onChange]);

    return (
        <div ref={ref} className="relative flex items-center">
            {open ? (
                <div className="absolute right-0 top-1/2 z-10 flex h-8 w-72 -translate-y-1/2 items-center gap-2 rounded-lg bg-white px-3 shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]">
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="flex-1 text-sm text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
                    />
                    <button
                        onClick={() => { setOpen(false); onChange(""); }}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Search"
                    title="Search"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-900"
                >
                    <Search className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
