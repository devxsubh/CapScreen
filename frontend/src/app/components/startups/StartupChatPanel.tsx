"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { UserMessage } from "@/app/components/assistant/UserMessage";
import { AssistantGreeting } from "@/app/components/assistant/AssistantGreeting";
import { ChatInput } from "@/app/components/assistant/ChatInput";
import { ScreenerAssistantMessage } from "@/app/components/screen/ScreenerAssistantMessage";
import { CapScreenIcon } from "@/components/chat/capscreen-icon";
import type { ScreenerMessage } from "@/app/components/screen/chatTypes";
import type { AppMessage } from "@/app/components/shared/types";
import { shouldShowMessageOptions } from "@/lib/parseMessageOptions";

interface Props {
    messages: ScreenerMessage[];
    isResponseLoading: boolean;
    handleChat: (message: ScreenerMessage, csvContent?: string | null) => void;
    cancel: () => void;
    startupName?: string;
    startupId?: string;
}

export function StartupChatPanel({
    messages,
    isResponseLoading,
    handleChat,
    cancel,
    startupName,
    startupId,
}: Props) {
    const { user } = useAuth();
    const { profile } = useUserProfile();
    const [showScrollButton, setShowScrollButton] = useState(false);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const username =
        profile?.displayName?.trim() || user?.email?.split("@")[0] || "there";

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const onScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            setShowScrollButton(scrollHeight - scrollTop - clientHeight > 80);
        };
        container.addEventListener("scroll", onScroll);
        onScroll();
        return () => container.removeEventListener("scroll", onScroll);
    }, [messages]);

    const lastContent =
        messages.length > 0 ? messages[messages.length - 1].content : "";

    useEffect(() => {
        scrollToBottom();
    }, [messages.length, lastContent, isResponseLoading, scrollToBottom]);

    const showEmpty = messages.length === 0;

    function handleSubmit(message: AppMessage) {
        handleChat({
            role: "user",
            content: message.content,
            files: message.files?.map((f) => ({ filename: f.filename })),
        });
    }

    return (
        <div className="flex flex-col h-full min-h-0 bg-white">
            <div className="h-10 flex items-center gap-2 px-4 border-b border-gray-200 shrink-0">
                <CapScreenIcon size={16} />
                <span className="text-xs text-gray-700">Project Assistant</span>
            </div>

            {showEmpty ? (
                <div className="flex-1 flex flex-col min-h-0">
                    <AssistantGreeting username={username} compact />
                </div>
            ) : (
                <div
                    ref={messagesContainerRef}
                    className="relative flex-1 min-h-0 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                >
                    <div className="w-full px-4 py-4 space-y-4">
                        {messages.map((msg, i) => (
                            <div key={i}>
                                {msg.role === "user" ? (
                                    <UserMessage
                                        content={msg.content}
                                        files={msg.files}
                                    />
                                ) : (
                                    <ScreenerAssistantMessage
                                        content={msg.content}
                                        events={msg.events}
                                        isStreaming={
                                            i === messages.length - 1 &&
                                            isResponseLoading
                                        }
                                        isError={!!msg.error}
                                        minHeight="0px"
                                        startupId={startupId}
                                        showOptionChips={shouldShowMessageOptions(
                                            i,
                                            messages,
                                            isResponseLoading,
                                        )}
                                        onOptionSelect={(value) => {
                                            handleChat({
                                                role: "user",
                                                content: value,
                                            });
                                        }}
                                    />
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} className="h-1" />
                    </div>

                    {showScrollButton && (
                        <div className="sticky bottom-3 flex justify-center pointer-events-none z-10 -mt-10">
                            <button
                                type="button"
                                onClick={scrollToBottom}
                                className="pointer-events-auto p-1.5 rounded-full bg-white shadow-md border border-gray-200"
                            >
                                <ArrowDown className="h-4 w-4 text-gray-500" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="shrink-0 px-4 pb-4 pt-2">
                <ChatInput
                    onSubmit={handleSubmit}
                    onCancel={cancel}
                    isLoading={isResponseLoading}
                    startupId={startupId}
                    projectName={startupName}
                />
            </div>
        </div>
    );
}
