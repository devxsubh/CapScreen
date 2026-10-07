"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { CapScreenIcon } from "@/components/chat/capscreen-icon";

const ICON_SIZE = 28;
const GAP = 14;

interface Props {
    username: string;
    compact?: boolean;
}

export function AssistantGreeting({ username, compact }: Props) {
    const { profile } = useUserProfile();
    const [loaded, setLoaded] = useState(false);
    const [iconOffset, setIconOffset] = useState(0);
    const [textOffset, setTextOffset] = useState(0);
    const textRef = useRef<HTMLHeadingElement>(null);

    useLayoutEffect(() => {
        if (!profile || !textRef.current) return;
        const h1Width = textRef.current.offsetWidth;
        setIconOffset((h1Width + GAP) / 2);
        setTextOffset((ICON_SIZE + GAP) / 2);
    }, [profile, username]);

    useEffect(() => {
        if (!iconOffset) return;
        const t = setTimeout(() => setLoaded(true), 100);
        return () => clearTimeout(t);
    }, [iconOffset]);

    return (
        <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="relative flex items-center justify-center h-[28px]">
                <div
                    className="absolute h-[30px]"
                    style={{
                        left: "50%",
                        transform: loaded
                            ? `translateX(calc(-50% - ${iconOffset}px))`
                            : "translateX(-50%)",
                        transition:
                            "transform 900ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    }}
                >
                    <CapScreenIcon size={ICON_SIZE} />
                </div>
                <h1
                    ref={textRef}
                    className={`absolute font-serif font-light text-gray-900 whitespace-nowrap ${
                        compact ? "text-2xl" : "text-3xl"
                    }`}
                    style={{
                        left: "50%",
                        transform: loaded
                            ? `translateX(calc(-50% + ${textOffset}px))`
                            : "translateX(-50%)",
                        opacity: loaded ? 1 : 0,
                        transition:
                            "transform 900ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 800ms ease-in-out 300ms",
                    }}
                >
                    Hi, {username}
                </h1>
            </div>
        </div>
    );
}
