"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { providerLabel, type ModelProvider } from "@/app/lib/modelAvailability";

interface Props {
    open: boolean;
    onClose: () => void;
    provider: ModelProvider | null;
    /** Optional override for the body sentence. */
    message?: string;
}

export function ApiKeyMissingModal({ open, onClose, provider, message }: Props) {
    if (!open) return null;

    const providerName = provider ? providerLabel(provider) : "the selected model";
    const body =
        message ??
        `${providerName} is not available on this deployment. Contact your CapScreen administrator — API keys are managed on the server, not in user settings.`;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/10 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <h2 className="text-base font-medium text-gray-900">
                            Model unavailable
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="px-5 pb-2 pt-1">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        {body}
                    </p>
                </div>

                <div className="flex justify-end px-5 pb-5 pt-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
