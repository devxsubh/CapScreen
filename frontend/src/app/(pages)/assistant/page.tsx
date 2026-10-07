"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAssistantChat } from "@/app/hooks/useAssistantChat";
import { InitialView } from "@/app/components/assistant/InitialView";
import { ChatView } from "@/app/components/assistant/ChatView";
import type { AppMessage } from "@/app/components/shared/types";

function AssistantPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const promptHandled = useRef(false);
    const { messages, isResponseLoading, handleChat, handleNewChat, cancel, screeningResult, startupHandoff, clearStartupHandoff } =
        useAssistantChat();

    useEffect(() => {
        const prompt = searchParams.get("prompt");
        if (!prompt || messages.length > 0 || promptHandled.current) return;
        promptHandled.current = true;
        const decoded = decodeURIComponent(prompt);
        void handleNewChat({ role: "user", content: decoded }).then((chatId) => {
            if (chatId) {
                router.replace(`/assistant/chat/${chatId}`);
            }
        });
    }, [searchParams, messages.length, handleNewChat, router]);

    async function handleInitialSubmit(message: AppMessage) {
        const chatId = await handleNewChat(message);
        if (chatId) router.push(`/assistant/chat/${chatId}`);
    }

    if (messages.length === 0) {
        return (
            <InitialView
                onSubmit={(message) => void handleInitialSubmit(message)}
            />
        );
    }

    return (
        <ChatView
            messages={messages}
            isResponseLoading={isResponseLoading}
            handleChat={handleChat}
            cancel={cancel}
            screeningResult={screeningResult}
            startupHandoff={startupHandoff}
            onClearStartupHandoff={clearStartupHandoff}
        />
    );
}

export default function AssistantPage() {
    return (
        <Suspense fallback={<InitialView onSubmit={() => {}} />}>
            <AssistantPageContent />
        </Suspense>
    );
}
