"use client";

import { File, FileText, Library } from "lucide-react";
import { CHAT_FOCUS, type ChatFocus } from "@/lib/chatFocus";
import { FOCUS_ICON } from "./focusIcons";

interface Props {
    content: string;
    files?: { filename: string; document_id?: string }[];
    workflow?: { id: string; title: string };
    focus?: ChatFocus;
}

export function UserMessage({ content, files, workflow, focus }: Props) {
    const hasFiles = files && files.length > 0;
    const FocusIcon = focus ? FOCUS_ICON[focus] : null;

    return (
        <div className="w-full flex justify-end">
            <div className="max-w-[80%] bg-gray-100 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{content}</p>
                {(workflow || focus || hasFiles) && (
                    <div className="flex flex-wrap justify-end gap-1.5 mt-3">
                        {focus && FocusIcon && (
                            <div className="inline-flex items-center gap-1 pl-2 pr-2.5 py-0.5 rounded-full text-xs bg-white text-gray-800 border border-gray-200 shadow-sm">
                                <FocusIcon className="h-2.5 w-2.5 shrink-0" />
                                <span className="max-w-[140px] truncate">{CHAT_FOCUS[focus].label}</span>
                            </div>
                        )}
                        {workflow && (
                            <div className="inline-flex items-center gap-1 pl-2 pr-2.5 py-0.5 rounded-full text-xs bg-white text-gray-800 border border-gray-200 shadow-sm">
                                <Library className="h-2.5 w-2.5 shrink-0" />
                                <span className="max-w-[140px] truncate">{workflow.title}</span>
                            </div>
                        )}
                        {hasFiles && files.map((f, i) => {
                            const ext = f.filename.split(".").pop()?.toLowerCase();
                            const isPdf = ext === "pdf";
                            return (
                                <div
                                    key={i}
                                    className="inline-flex items-center gap-1 pl-2 pr-2.5 py-0.5 rounded-full text-xs text-white shadow border border-gray-950 bg-gray-950"
                                >
                                    {isPdf
                                        ? <FileText className="h-2.5 w-2.5 shrink-0 text-red-400" />
                                        : <File className="h-2.5 w-2.5 shrink-0 text-blue-400" />
                                    }
                                    <span className="max-w-[140px] truncate">{f.filename}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
