"use client";

import { useState } from "react";
import { ChatInput } from "./ChatInput";
import { SelectAssistantProjectModal } from "./SelectAssistantProjectModal";
import { GettingStarted } from "./GettingStarted";
import type { AppMessage } from "../shared/types";

interface InitialViewProps {
    onSubmit: (message: AppMessage) => void;
}

export function InitialView({ onSubmit }: InitialViewProps) {
    const [startupModalOpen, setStartupModalOpen] = useState(false);

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto px-4 sm:px-6">
            <div className="flex flex-1 flex-col items-center justify-center py-10">
                <div className="w-full max-w-3xl">
                    <div className="mb-8 text-center animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
                        <h1 className="font-serif text-4xl font-light text-gray-900 sm:text-5xl sm:leading-tight">
                            What would you like to screen today?
                        </h1>
                        <p className="mt-3 font-serif text-base text-gray-500 sm:whitespace-nowrap sm:text-lg">
                            Ask about a startup, or attach a cap table for a sanctions and ownership review.
                        </p>
                    </div>

                    <ChatInput
                        onSubmit={onSubmit}
                        onCancel={() => {}}
                        isLoading={false}
                        onStartupsClick={() => setStartupModalOpen(true)}
                        showProviderMenu
                        hero
                    />

                    <p className="mt-6 text-center text-xs text-gray-500">
                        AI can make mistakes. Answers are not legal advice.
                    </p>

                    <GettingStarted />
                </div>
            </div>

            <SelectAssistantProjectModal
                open={startupModalOpen}
                onClose={() => setStartupModalOpen(false)}
            />
        </div>
    );
}
