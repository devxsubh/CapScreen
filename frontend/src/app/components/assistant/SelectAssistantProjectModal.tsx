"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
import { listStartups } from "@/lib/startupsApi";
import { ProjectPicker } from "../shared/ProjectPicker";
import type { AppProject } from "../shared/types";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function SelectAssistantProjectModal({ open, onClose }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const router = useRouter();
    const { saveChat } = useChatHistoryContext();
    const [loading, setLoading] = useState(false);
    const [startups, setStartups] = useState<AppProject[]>([]);

    useEffect(() => {
        if (!open) return;
        setSelectedId(null);
        setLoading(true);
        listStartups()
            .then((rows) =>
                setStartups(
                    rows.map((s) => ({
                        id: s.id,
                        name: s.name,
                        user_id: "preview-user",
                        is_owner: true,
                        cm_number: null,
                        shared_with: [],
                        created_at: s.createdAt,
                        updated_at: s.createdAt,
                    })),
                ),
            )
            .catch(() => setStartups([]))
            .finally(() => setLoading(false));
    }, [open]);

    if (!open) return null;

    async function handleContinue() {
        if (!selectedId) return;
        setCreating(true);
        try {
            const chatId = await saveChat(selectedId);
            if (!chatId) return;
            onClose();
            router.push(`/startups/${selectedId}/assistant/chat/${chatId}`);
        } finally {
            setCreating(false);
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-xs">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col h-[600px]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>Assistant</span>
                        <span>›</span>
                        <span>Start chat in a startup</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <ProjectPicker
                    projects={startups}
                    loading={loading}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    entityLabel="Startups"
                    searchPlaceholder="Search startups…"
                    emptyMessage="No startups yet"
                    icon="startup"
                    showDocumentCount={false}
                />

                {/* Footer */}
                <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleContinue}
                        disabled={!selectedId || creating}
                        className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                    >
                        {creating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            "Continue"
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
