"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
    onDrag: (dx: number) => void;
}

/** Drag-handle divider for resizing adjacent panels */
export function ResizeDivider({ onDrag }: Props) {
    const dragging = useRef(false);
    const lastX = useRef(0);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseDown = (e: React.MouseEvent) => {
        dragging.current = true;
        setIsDragging(true);
        lastX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!dragging.current) return;
            onDrag(e.clientX - lastX.current);
            lastX.current = e.clientX;
        }
        function onMouseUp() {
            if (!dragging.current) return;
            dragging.current = false;
            setIsDragging(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [onDrag]);

    return (
        <div className="relative w-0 shrink-0 z-10">
            <div
                onMouseDown={onMouseDown}
                className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize flex items-stretch justify-center group"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panels"
            >
                <div
                    className={`w-px transition-colors ${
                        isDragging
                            ? "bg-gray-400"
                            : "bg-gray-200 group-hover:bg-gray-400"
                    }`}
                />
            </div>
        </div>
    );
}
