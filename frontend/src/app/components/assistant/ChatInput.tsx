"use client";

import {
    useState,
    useCallback,
    useRef,
    forwardRef,
    useImperativeHandle,
} from "react";
import {
    ArrowRight,
    Check,
    File,
    FileText,
    Building2,
    Library,
    Square,
    X,
} from "lucide-react";
import { AddDocButton } from "./AddDocButton";
import { AddDocumentsModal } from "../shared/AddDocumentsModal";
import { AssistantWorkflowModal } from "./AssistantWorkflowModal";
import { ApiKeyMissingModal } from "../shared/ApiKeyMissingModal";
import { ModelToggle } from "./ModelToggle";
import { useSelectedModel } from "@/app/hooks/useSelectedModel";
import { useUserProfile } from "@/contexts/UserProfileContext";
import {
    getModelProvider,
    isModelAvailable,
    type ModelProvider,
} from "@/app/lib/modelAvailability";
import { UI_PREVIEW_MODE } from "@/lib/uiPreview";

/** Claude is always chosen by the backend (Haiku). */
const USE_SERVER_CLAUDE = true;
import {
    StartupMentionMenu,
    insertStartupMention,
} from "./StartupMentionMenu";
import type { AppDocument, AppMessage } from "../shared/types";
import {
    ASSISTANT_SAMPLE_PROMPTS,
    type AssistantSamplePrompt,
} from "@/lib/assistantSamplePrompts";

export interface ChatInputHandle {
    addDoc: (doc: AppDocument) => void;
}

interface Props {
    onSubmit: (message: AppMessage) => void;
    onCancel: () => void;
    isLoading: boolean;
    hideAddDocButton?: boolean;
    hideWorkflowButton?: boolean;
    onStartupsClick?: () => void;
    projectName?: string;
    projectCmNumber?: string | null;
    startupId?: string;
    showSamplePrompts?: boolean;
    samplePrompts?: AssistantSamplePrompt[];
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
    {
        onSubmit,
        onCancel,
        isLoading,
        hideAddDocButton,
        hideWorkflowButton,
        onStartupsClick,
        projectName,
        projectCmNumber,
        startupId,
        showSamplePrompts = true,
        samplePrompts = ASSISTANT_SAMPLE_PROMPTS,
    }: Props,
    ref,
) {
    const [value, setValue] = useState("");
    const [attachedDocs, setAttachedDocs] = useState<AppDocument[]>([]);
    const [attachedCsvFile, setAttachedCsvFile] = useState<File | null>(null);
    const [selectedWorkflow, setSelectedWorkflow] = useState<{
        id: string;
        title: string;
    } | null>(null);
    const [model, setModel] = useSelectedModel();
    const { profile } = useUserProfile();
    const apiKeys = profile?.apiKeys;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [docSelectorOpen, setDocSelectorOpen] = useState(false);
    const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
    const [apiKeyModalProvider, setApiKeyModalProvider] =
        useState<ModelProvider | null>(null);
    const [cursor, setCursor] = useState(0);
    const [mentionOpen, setMentionOpen] = useState(false);

    useImperativeHandle(ref, () => ({
        addDoc: (doc: AppDocument) => {
            setAttachedDocs((prev) => {
                if (prev.some((d) => d.id === doc.id)) return prev;
                return [...prev, doc];
            });
        },
    }));

    const handleAddDocFromProject = useCallback((doc: AppDocument) => {
        setAttachedDocs((prev) => {
            if (prev.some((d) => d.id === doc.id)) return prev;
            return [...prev, doc];
        });
    }, []);

    const handleAddDocsFromSelector = useCallback(
        (selectedDocs: AppDocument[]) => {
            setAttachedDocs((prev) => {
                const existing = new Set(prev.map((d) => d.id));
                return [
                    ...prev,
                    ...selectedDocs.filter((d) => !existing.has(d.id)),
                ];
            });
        },
        [],
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        setCursor(e.target.selectionStart);
        setMentionOpen(e.target.value.slice(0, e.target.selectionStart).includes("@"));
        const el = e.target;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    };

    const handleSelectStartupMention = (startupName: string) => {
        const { nextValue, nextCursor } = insertStartupMention(
            value,
            cursor,
            startupName,
        );
        setValue(nextValue);
        setCursor(nextCursor);
        setMentionOpen(false);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(nextCursor, nextCursor);
        });
    };

    const handleSubmit = async () => {
        const query = value.trim();
        if ((!query && !attachedCsvFile && attachedDocs.length === 0) || isLoading)
            return;
        if (
            !USE_SERVER_CLAUDE &&
            !UI_PREVIEW_MODE &&
            apiKeys &&
            !isModelAvailable(model, apiKeys)
        ) {
            setApiKeyModalProvider(getModelProvider(model));
            return;
        }
        setValue("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        const csvFile = attachedCsvFile;
        setAttachedCsvFile(null);

        let csvContent: string | undefined;
        if (csvFile) {
            csvContent = await csvFile.text();
        }

        const files: { filename: string; document_id?: string }[] =
            attachedDocs.map((d) => ({
                filename: d.filename,
                document_id: d.id,
            }));
        if (csvFile) {
            files.push({ filename: csvFile.name });
        }
        setAttachedDocs([]);
        const wf = selectedWorkflow;
        setSelectedWorkflow(null);
        const modelPayload =
            !USE_SERVER_CLAUDE && !UI_PREVIEW_MODE ? { model } : {};

        const content =
            query ||
            (csvFile
                ? `Please screen the attached cap table (${csvFile.name}).`
                : "");

        onSubmit?.({
            role: "user",
            content,
            files: files.length > 0 ? files : undefined,
            workflow: wf ?? undefined,
            csvContent,
            ...modelPayload,
        });
    };

    const handleActionClick = () => {
        if (isLoading) {
            onCancel();
        } else {
            void handleSubmit();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        }
    };

    const applySamplePrompt = (prompt: string) => {
        setValue(prompt);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
        });
    };

    return (
        <>
            <div className="w-full">
                <div className="border border-gray-300 rounded-[16px] md:rounded-[20px] bg-white">
                    {/* Attached chips */}
                    {(selectedWorkflow ||
                        attachedDocs.length > 0 ||
                        attachedCsvFile) && (
                        <div className="flex flex-wrap gap-1.5 px-2 pt-2">
                            {selectedWorkflow && (
                                <div className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs bg-blue-600 text-white border border-white/20 shadow backdrop-blur-sm">
                                    <Library className="h-2.5 w-2.5 shrink-0" />
                                    <span className="max-w-[140px] truncate">
                                        {selectedWorkflow.title}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelectedWorkflow(null)
                                        }
                                        className="rounded-full p-0.5 ml-0.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </div>
                            )}
                            {attachedCsvFile && (
                                <div className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white shadow border border-white/20 bg-black backdrop-blur-sm">
                                    <File className="h-2.5 w-2.5 shrink-0 text-green-400" />
                                    <span className="max-w-[140px] truncate">
                                        {attachedCsvFile.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setAttachedCsvFile(null)}
                                        className="rounded-full p-0.5 ml-0.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </div>
                            )}
                            {attachedDocs.map((doc) => {
                                const ft = doc.file_type?.toLowerCase();
                                const isPdf = ft === "pdf";
                                return (
                                    <div
                                        key={doc.id}
                                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white shadow border border-white/20 bg-black backdrop-blur-sm"
                                    >
                                        {isPdf ? (
                                            <FileText className="h-2.5 w-2.5 shrink-0 text-red-400" />
                                        ) : (
                                            <File className="h-2.5 w-2.5 shrink-0 text-blue-400" />
                                        )}
                                        <span className="max-w-[140px] truncate">
                                            {doc.filename}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setAttachedDocs((prev) =>
                                                    prev.filter(
                                                        (d) => d.id !== doc.id,
                                                    ),
                                                )
                                            }
                                            className="rounded-full p-0.5 ml-0.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Input */}
                    <div className="relative px-4 pt-4 overflow-visible">
                        {mentionOpen && (
                            <StartupMentionMenu
                                value={value}
                                cursor={cursor}
                                onSelect={handleSelectStartupMention}
                                onClose={() => setMentionOpen(false)}
                            />
                        )}
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            placeholder="Ask a question… use @StartupName to pull in screening results"
                            value={value}
                            onChange={handleChange}
                            onClick={(e) =>
                                setCursor(
                                    (e.target as HTMLTextAreaElement)
                                        .selectionStart,
                                )
                            }
                            onKeyUp={(e) =>
                                setCursor(
                                    (e.target as HTMLTextAreaElement)
                                        .selectionStart,
                                )
                            }
                            onKeyDown={handleKeyDown}
                            className="w-full resize-none text-sm overflow-hidden border-0 text-base p-0 bg-transparent outline-none placeholder:text-gray-400 leading-6 max-h-48"
                        />
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between md:p-2.5 p-2">
                        <div className="flex items-center gap-1">
                            {!hideAddDocButton && (
                                <AddDocButton
                                    onSelectDoc={handleAddDocFromProject}
                                    onSelectCsvFile={setAttachedCsvFile}
                                    onBrowseAll={() => setDocSelectorOpen(true)}
                                    selectedDocIds={attachedDocs.map(
                                        (d) => d.id,
                                    )}
                                    attachmentCount={
                                        attachedDocs.length +
                                        (attachedCsvFile ? 1 : 0)
                                    }
                                    startupId={startupId}
                                />
                            )}
                            {!hideWorkflowButton && !startupId && (
                                <button
                                    type="button"
                                    onClick={() => setWorkflowModalOpen(true)}
                                    aria-label="Open workflows"
                                    className={`flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm transition-colors ${selectedWorkflow ? "text-blue-600 hover:bg-blue-50" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
                                >
                                    {selectedWorkflow ? (
                                        <Check className="h-3.5 w-3.5" />
                                    ) : (
                                        <Library className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
                                        Workflows
                                    </span>
                                </button>
                            )}
                            {onStartupsClick && (
                                <button
                                    type="button"
                                    onClick={onStartupsClick}
                                    aria-label="Open startups"
                                    className="flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                >
                                    <Building2 className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">
                                        Startup
                                    </span>
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            {!USE_SERVER_CLAUDE && (
                                <ModelToggle
                                    value={model}
                                    onChange={setModel}
                                    apiKeys={apiKeys}
                                />
                            )}
                            <button
                                type="button"
                                className="relative bg-gradient-to-b from-neutral-700 to-black text-white rounded-[10px] h-8 w-8 flex items-center justify-center cursor-pointer disabled:cursor-default disabled:from-neutral-600 disabled:to-black backdrop-blur-xl border border-white/30 active:enabled:scale-95 transition-all duration-150"
                                onClick={handleActionClick}
                                disabled={
                                    !isLoading &&
                                    !value.trim() &&
                                    !attachedCsvFile &&
                                    attachedDocs.length === 0
                                }
                            >
                                {isLoading ? (
                                    <Square
                                        className="h-4 w-4"
                                        fill="currentColor"
                                        strokeWidth={0}
                                    />
                                ) : (
                                    <ArrowRight className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {showSamplePrompts &&
                    !isLoading &&
                    !value.trim() &&
                    samplePrompts.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 justify-center px-1">
                            {samplePrompts.map((sample) => (
                                <button
                                    key={sample.label}
                                    type="button"
                                    onClick={() =>
                                        applySamplePrompt(sample.prompt)
                                    }
                                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                                >
                                    {sample.label}
                                </button>
                            ))}
                        </div>
                    )}
            </div>

            <AddDocumentsModal
                open={docSelectorOpen}
                onClose={() => setDocSelectorOpen(false)}
                onSelect={handleAddDocsFromSelector}
                onSelectCsvFile={setAttachedCsvFile}
                breadcrumb={
                    startupId
                        ? ["Startup", "Add Documents"]
                        : ["Assistant", "Add Documents"]
                }
            />
            <AssistantWorkflowModal
                open={workflowModalOpen}
                onClose={() => setWorkflowModalOpen(false)}
                onSelect={(wf) => {
                    setSelectedWorkflow({ id: wf.id, title: wf.title });
                    setWorkflowModalOpen(false);
                }}
                projectName={projectName}
                projectCmNumber={projectCmNumber}
            />
            <ApiKeyMissingModal
                open={apiKeyModalProvider !== null}
                provider={apiKeyModalProvider}
                onClose={() => setApiKeyModalProvider(null)}
            />
        </>
    );
});
