/** Startup picker for running a workflow, with the include-documents toggle. */

import { useState } from "react";
import { Folder, X } from "lucide-react";
import type { AppProject } from "@/types/app";

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------
export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${on ? "bg-gray-900" : "bg-gray-200"}`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-4" : "translate-x-0"}`}
            />
        </button>
    );
}

// ---------------------------------------------------------------------------
// Simple project picker (input + dropdown)
// ---------------------------------------------------------------------------
export function WorkflowProjectPicker({
    projects,
    selectedId,
    onSelect,
}: {
    projects: AppProject[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const selected = projects.find((p) => p.id === selectedId);
    const filtered = search
        ? projects.filter((p) =>
              p.name.toLowerCase().includes(search.toLowerCase()),
          )
        : projects;

    return (
        <div className="relative">
            <input
                type="text"
                value={selectedId ? (selected?.name ?? "") : search}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setOpen(true);
                    onSelect(null);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Select a project…"
                className="w-full text-xs text-gray-700 placeholder:text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 outline-none"
            />
            {selectedId && (
                <button
                    onMouseDown={() => {
                        onSelect(null);
                        setSearch("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
            {open && !selectedId && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm overflow-y-auto max-h-40">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">
                            No projects found
                        </p>
                    ) : (
                        filtered.map((p) => (
                            <button
                                key={p.id}
                                onMouseDown={() => {
                                    onSelect(p.id);
                                    setSearch("");
                                    setOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 text-gray-700"
                            >
                                <Folder className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                {p.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
