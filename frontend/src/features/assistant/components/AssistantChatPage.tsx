"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAssistantChat } from "@/features/assistant/hooks/useAssistantChat";
import { useChatHistoryContext } from "@/contexts/ChatHistoryContext";
import { ChatView } from "./ChatView";
import { getChat } from "@/api/chats";

export function AssistantChatPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const { setCurrentChatId, newChatMessages, setNewChatMessages } =
        useChatHistoryContext();

    const initialMessages = newChatMessages ?? [];
    const { messages, isResponseLoading, handleChat, setMessages, cancel, answerApproval, screeningResult, startupHandoff, clearStartupHandoff } =
        useAssistantChat({ initialMessages, chatId: id });

    const hasAutoSent = useRef(false);
    const hasLoaded = useRef(false);

    useEffect(() => {
        setCurrentChatId(id);
    }, [id, setCurrentChatId]);

    useEffect(() => {
        if (initialMessages.length > 0) {
            if (newChatMessages) setNewChatMessages(null);
            return;
        }
        if (hasLoaded.current || messages.length > 0) return;
        hasLoaded.current = true;

        getChat(id)
            .then(({ messages: loaded }) => {
                if (loaded.length > 0) {
                    setMessages(loaded);
                } else if (newChatMessages?.length) {
                    setMessages(newChatMessages);
                } else {
                    router.replace("/assistant");
                }
            })
            .catch(() => router.replace("/assistant"));
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (
            newChatMessages &&
            newChatMessages.length === 1 &&
            newChatMessages[0].role === "user" &&
            !hasAutoSent.current &&
            !isResponseLoading &&
            messages.length === 1
        ) {
            hasAutoSent.current = true;
            void handleChat(newChatMessages[0]);
        }
    }, [newChatMessages, messages.length, isResponseLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ChatView
            messages={messages}
            isResponseLoading={isResponseLoading}
            handleChat={handleChat}
            cancel={cancel}
            onApprovalAnswer={answerApproval}
            screeningResult={screeningResult}
            startupHandoff={startupHandoff}
            onClearStartupHandoff={clearStartupHandoff}
        />
    );
}
