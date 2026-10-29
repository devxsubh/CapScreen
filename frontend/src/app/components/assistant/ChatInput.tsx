"use client";

import {
    useState,
    useCallback,
    useRef,
    useEffect,
    forwardRef,
    useImperativeHandle,
} from "react";
import Link from "next/link";
import {
    ArrowUp,
    AtSign,
    Building2,
    Check,
    ChevronDown,
    File,
    FileText,
    Landmark,
    LayoutGrid,
    Link2,
    Library,
    Loader2,
    Paperclip,
    Settings2,
    ShieldCheck,
    Square,
    Upload,
    Wrench,
    X,
    type LucideIcon,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAddDocActions } from "./AddDocButton";
import { AddDocumentsModal } from "../shared/AddDocumentsModal";
import { AssistantWorkflowModal } from "./AssistantWorkflowModal";
import { ModelPicker } from "../ai/ModelPicker";
import { FOCUS_ICON } from "./focusIcons";
import {
    StartupMentionMenu,
    insertStartupMention,
} from "./StartupMentionMenu";
import type { AppDocument, AppMessage } from "../shared/types";
import { CHAT_FOCUS, CHAT_FOCUS_ORDER, type ChatFocus } from "@/lib/chatFocus";
import { desktopDataApi } from "@/lib/desktopDataApi";
import { CONNECTOR_GROUPS, CONNECTORS, useHiddenConnectors } from "@/lib/connectors";

/** Toolbar shows icons only when the chat box is narrower than this. */
const COMPACT_TOOLS_BELOW_PX = 520;

const triggerClass =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-900 data-[state=open]:bg-gray-200/70 data-[state=open]:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:opacity-50";

const contextTriggerClass =
    "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-0.5 text-sm text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300";

const clearButtonClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-900";

const menuItemClass = "cursor-pointer gap-3 rounded-lg px-3 py-2 text-sm";

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
    /** Landing layout: quick-action chips under the box. */
    hero?: boolean;
    /** Show the chat model picker (global agent binding). */
    showProviderMenu?: boolean;
}

type SanctionsSources = { state: "loading" } | { state: "error" } | { state: "ready"; lists: Array<{ id: string; label: string; on: boolean }> };

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
        hero = false,
        showProviderMenu,
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
    const [focus, setFocus] = useState<ChatFocus | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [docSelectorOpen, setDocSelectorOpen] = useState(false);
    const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [compactTools, setCompactTools] = useState(false);
    const [sources, setSources] = useState<SanctionsSources>({ state: "loading" });
    const [hiddenConnectors] = useHiddenConnectors();

    const showDocs = !hideAddDocButton;
    const showWorkflows = !hideWorkflowButton;
    const showStartup = Boolean(onStartupsClick);
    const showModel = Boolean(showProviderMenu);
    const showContextBar = showStartup || showWorkflows;

    useEffect(() => {
        const el = boxRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width ?? el.clientWidth;
            setCompactTools(w < COMPACT_TOOLS_BELOW_PX);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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

    const docActions = useAddDocActions({
        onSelectDoc: handleAddDocFromProject,
        onSelectCsvFile: setAttachedCsvFile,
        onBrowseAll: () => setDocSelectorOpen(true),
        startupId,
    });

    const attachmentCount = attachedDocs.length + (attachedCsvFile ? 1 : 0);
    const canSend = Boolean(value.trim() || attachedCsvFile || attachedDocs.length);

    /** The sanctions lists screening runs against, loaded when the sources menu opens. */
    const loadSources = (open: boolean) => {
        if (!open || sources.state === "ready") return;
        setSources({ state: "loading" });
        desktopDataApi
            .settings()
            .then((r) =>
                setSources({
                    state: "ready",
                    lists: r.availableLists.map((l) => ({ ...l, on: r.settings.sanctionsLists.includes(l.id) })),
                }),
            )
            .catch(() => setSources({ state: "error" }));
    };

    const resize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        setCursor(e.target.selectionStart);
        setMentionOpen(e.target.value.slice(0, e.target.selectionStart).includes("@"));
        resize();
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

        const content =
            query ||
            (csvFile
                ? `Please screen the attached cap table (${csvFile.name}).`
                : "");

        // The focus stays on for follow-up messages until it is cleared.
        onSubmit?.({
            role: "user",
            content,
            files: files.length > 0 ? files : undefined,
            workflow: wf ?? undefined,
            focus: focus ?? undefined,
            csvContent,
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

    /** Insert "@" at the cursor and open the startup picker. */
    const insertMention = () => {
        const pos = textareaRef.current?.selectionStart ?? value.length;
        const before = value.slice(0, pos);
        const at = before && !/\s$/.test(before) ? " @" : "@";
        const next = before + at + value.slice(pos);
        const nextCursor = pos + at.length;
        setValue(next);
        setCursor(nextCursor);
        setMentionOpen(true);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(nextCursor, nextCursor);
            resize();
        });
    };

    const toggleFocus = (f: ChatFocus) => setFocus((cur) => (cur === f ? null : f));

    const FocusIcon = focus ? FOCUS_ICON[focus] : Wrench;

    return (
        <>
            <div className="w-full">
                {showContextBar && (
                    <div className="mb-2 flex items-center gap-5 px-1.5">
                        {showStartup && (
                            <button
                                type="button"
                                onClick={onStartupsClick}
                                className={contextTriggerClass}
                                aria-label="Choose startup"
                            >
                                <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                <span className="max-w-40 truncate">{projectName ?? "Choose startup"}</span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            </button>
                        )}
                        {showWorkflows && (
                            <div className="inline-flex max-w-full items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => setWorkflowModalOpen(true)}
                                    className={contextTriggerClass}
                                    aria-label="Choose workflow"
                                >
                                    <Library className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                    <span className="max-w-48 truncate">{selectedWorkflow?.title ?? "Workflows"}</span>
                                    {!selectedWorkflow && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                                </button>
                                {selectedWorkflow && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedWorkflow(null)}
                                        className={clearButtonClass}
                                        aria-label="Clear workflow"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div
                    ref={boxRef}
                    data-tour="composer"
                    className="rounded-[20px] border border-gray-200 bg-gray-100/80 transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-gray-300 focus-within:bg-white focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
                >
                    {showDocs && docActions.fileInput}

                    {(attachedDocs.length > 0 || attachedCsvFile) && (
                        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                            {attachedCsvFile && (
                                <AttachmentChip
                                    icon={<File className="h-3.5 w-3.5 text-emerald-600" />}
                                    name={attachedCsvFile.name}
                                    onRemove={() => setAttachedCsvFile(null)}
                                />
                            )}
                            {attachedDocs.map((doc) => (
                                <AttachmentChip
                                    key={doc.id}
                                    icon={
                                        doc.file_type?.toLowerCase() === "pdf" ? (
                                            <FileText className="h-3.5 w-3.5 text-red-500" />
                                        ) : (
                                            <File className="h-3.5 w-3.5 text-blue-500" />
                                        )
                                    }
                                    name={doc.filename}
                                    onRemove={() =>
                                        setAttachedDocs((prev) => prev.filter((d) => d.id !== doc.id))
                                    }
                                />
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="relative overflow-visible px-5 pt-4">
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
                            placeholder="Ask CapScreen to screen a cap table, or @mention a startup…"
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
                            className={`max-h-40 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-6 text-gray-900 ${hero ? "min-h-14" : ""} outline-none placeholder:text-gray-400`}
                        />
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1.5">
                        <nav aria-label="Chat sources and tools" className="flex min-w-0 items-center gap-0.5">
                            {showDocs && (
                                <DropdownMenu onOpenChange={loadSources}>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" data-tour="composer-sources" className={triggerClass} aria-label="Files and sources">
                                            {docActions.uploading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Paperclip className="h-4 w-4" />
                                            )}
                                            {!compactTools && <span className="whitespace-nowrap">Files &amp; Sources</span>}
                                            {attachmentCount > 0 && (
                                                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-medium tabular-nums text-white">
                                                    {attachmentCount}
                                                </span>
                                            )}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-64 rounded-xl bg-white p-1.5">
                                        <DropdownMenuItem
                                            className={menuItemClass}
                                            disabled={docActions.uploading}
                                            onSelect={() => docActions.openFilePicker()}
                                        >
                                            <Upload className="h-4 w-4 text-gray-500" />
                                            <span className="flex-1">Add files</span>
                                            <span className="text-xs text-gray-400">PDF, DOCX, CSV</span>
                                        </DropdownMenuItem>
                                        {!startupId && (
                                            <DropdownMenuItem className={menuItemClass} onSelect={() => setDocSelectorOpen(true)}>
                                                <LayoutGrid className="h-4 w-4 text-gray-500" />
                                                <span className="flex-1">Browse documents</span>
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger className={menuItemClass}>
                                                <Link2 className="h-4 w-4 text-gray-500" />
                                                <span className="flex-1">Connectors</span>
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent className="w-72 rounded-xl bg-white p-1.5">
                                                <div className="px-3 pb-1 pt-2">
                                                    <p className="text-sm font-medium text-gray-900">Connectors</p>
                                                    <p className="mt-0.5 text-xs text-gray-500">
                                                        Bring cap tables, documents and company data in from the tools you use.
                                                    </p>
                                                </div>
                                                {CONNECTOR_GROUPS.map((group) => ({
                                                    group,
                                                    items: CONNECTORS.filter((c) => c.group === group && !hiddenConnectors.has(c.id)),
                                                }))
                                                    .filter((g) => g.items.length > 0)
                                                    .map(({ group, items }) => (
                                                    <div key={group}>
                                                        <p className="px-3 pb-1 pt-2.5 text-[11px] uppercase tracking-wide text-gray-400">{group}</p>
                                                        {items.map(({ name, logo }) => (
                                                            <DropdownMenuItem key={name} disabled className={`${menuItemClass} py-1.5 data-[disabled]:opacity-100`}>
                                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
                                                                    {logo ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element -- tiny static logo
                                                                        <img src={logo} alt="" className="h-4 w-4 object-contain" />
                                                                    ) : (
                                                                        <Landmark className="h-3.5 w-3.5 text-gray-500" />
                                                                    )}
                                                                </span>
                                                                <span className="flex-1 text-gray-500">{name}</span>
                                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                                                    Soon
                                                                </span>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </div>
                                                ))}
                                                {hiddenConnectors.size >= CONNECTORS.length && (
                                                    <p className="px-3 py-2 text-xs text-gray-500">All connectors are hidden.</p>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem asChild className={menuItemClass}>
                                                    <Link href="/settings/connectors">
                                                        <Settings2 className="h-4 w-4 text-gray-500" />
                                                        Manage connectors
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger className={menuItemClass}>
                                                <ShieldCheck className="h-4 w-4 text-gray-500" />
                                                <span className="flex-1">Sanctions sources</span>
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent className="w-72 rounded-xl bg-white p-1.5">
                                                {sources.state === "loading" ? (
                                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lists…
                                                    </div>
                                                ) : sources.state === "error" ? (
                                                    <p className="px-3 py-2 text-xs text-gray-500">
                                                        Sanctions lists are available in the desktop app.
                                                    </p>
                                                ) : (
                                                    sources.lists.map((l) => (
                                                        <div
                                                            key={l.id}
                                                            className={`flex items-center gap-3 px-3 py-1.5 text-sm ${l.on ? "text-gray-900" : "text-gray-400"}`}
                                                        >
                                                            <span className="min-w-0 flex-1 truncate">{l.label}</span>
                                                            {l.on && <Check className="h-3.5 w-3.5 shrink-0" />}
                                                        </div>
                                                    ))
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem asChild className={menuItemClass}>
                                                    <Link href="/settings/sanctions">
                                                        <Settings2 className="h-4 w-4 text-gray-500" />
                                                        Manage sources
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}

                            {showDocs && <Divider />}

                            {focus ? (
                                <div data-tour="composer-tools" className="flex h-8 max-w-[13rem] items-center rounded-full border border-gray-200 bg-white text-gray-900 shadow-sm animate-in fade-in-0 zoom-in-95">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-l-full pl-3 pr-1 text-[13px]"
                                                aria-label={`Focus: ${CHAT_FOCUS[focus].label}`}
                                            >
                                                <FocusIcon className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{CHAT_FOCUS[focus].label}</span>
                                            </button>
                                        </DropdownMenuTrigger>
                                        <ToolsMenu focus={focus} onToggle={toggleFocus} />
                                    </DropdownMenu>
                                    <button
                                        type="button"
                                        onClick={() => setFocus(null)}
                                        className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                                        aria-label="Clear focus"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" data-tour="composer-tools" className={triggerClass} aria-label="Tools">
                                            <Wrench className="h-4 w-4" />
                                            {!compactTools && <span>Tools</span>}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <ToolsMenu focus={focus} onToggle={toggleFocus} />
                                </DropdownMenu>
                            )}

                            <Divider />
                            <button
                                type="button"
                                onClick={insertMention}
                                className={triggerClass}
                                aria-label="Mention a startup"
                                title="Pull a startup's screening results into this chat"
                            >
                                <AtSign className="h-4 w-4" />
                                {!compactTools && <span>Mention</span>}
                            </button>
                        </nav>

                        <div className="flex shrink-0 items-center gap-1">
                            {showModel && (
                                <>
                                    <span data-tour="composer-model">
                                        <ModelPicker />
                                    </span>
                                    <Divider />
                                </>
                            )}
                            <button
                                type="button"
                                onClick={handleActionClick}
                                disabled={!isLoading && !canSend}
                                aria-label={isLoading ? "Stop" : "Send"}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-950 text-white shadow-sm transition-all duration-150 hover:bg-gray-800 active:enabled:scale-95 disabled:cursor-default disabled:bg-gray-300"
                            >
                                {isLoading ? (
                                    <Square className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                                ) : (
                                    <ArrowUp className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {hero && !isLoading && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2 px-1" aria-label="Quick actions">
                        {CHAT_FOCUS_ORDER.map((f) => (
                            <QuickAction
                                key={f}
                                icon={FOCUS_ICON[f]}
                                label={CHAT_FOCUS[f].label}
                                active={focus === f}
                                onClick={() => toggleFocus(f)}
                            />
                        ))}
                        {showDocs && (
                            <QuickAction icon={Upload} label="Upload cap table" onClick={() => docActions.openFilePicker()} />
                        )}
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
        </>
    );
});

function ToolsMenu({ focus, onToggle }: { focus: ChatFocus | null; onToggle: (f: ChatFocus) => void }) {
    return (
        <DropdownMenuContent align="start" className="w-72 rounded-xl bg-white p-1.5">
            <div className="px-3 pb-1 pt-2">
                <p className="text-sm font-medium text-gray-900">AI tools</p>
                <p className="mt-0.5 text-xs text-gray-500">Change what the assistant focuses on without leaving the chat.</p>
            </div>
            {CHAT_FOCUS_ORDER.map((f) => {
                const Icon = FOCUS_ICON[f];
                return (
                    <DropdownMenuItem key={f} className="cursor-pointer items-start gap-3 rounded-lg px-3 py-2" onSelect={() => onToggle(f)}>
                        <Icon className="mt-0.5 h-4 w-4 text-gray-500" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm text-gray-900">{CHAT_FOCUS[f].label}</span>
                            <span className="block text-xs text-gray-500">{CHAT_FOCUS[f].description}</span>
                        </span>
                        {focus === f && <Check className="mt-0.5 h-4 w-4 text-gray-900" />}
                    </DropdownMenuItem>
                );
            })}
        </DropdownMenuContent>
    );
}

function QuickAction({
    icon: Icon,
    label,
    active,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`group inline-flex h-9 max-w-60 items-center gap-2 rounded-xl border bg-white pl-1.5 pr-3 text-[13px] shadow-sm transition-colors ${
                active
                    ? "border-gray-400 bg-gray-50 text-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
        >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{label}</span>
            {active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-gray-900" />
            ) : (
                <span aria-hidden className="text-sm leading-none text-gray-400 transition-colors group-hover:text-gray-900">
                    +
                </span>
            )}
        </button>
    );
}

function AttachmentChip({ icon, name, onRemove }: { icon: React.ReactNode; name: string; onRemove: () => void }) {
    return (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1 pl-2 pr-1 text-xs text-gray-700 shadow-sm">
            {icon}
            <span className="max-w-[160px] truncate">{name}</span>
            <button
                type="button"
                onClick={onRemove}
                className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
                aria-label={`Remove ${name}`}
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

function Divider() {
    return <span aria-hidden className="mx-1 h-5 w-px shrink-0 self-center rounded-full bg-gray-300/80" />;
}
