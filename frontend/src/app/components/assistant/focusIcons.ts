import { FileCheck, FileText, GitBranch, Globe, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ChatFocus } from "@/lib/chatFocus";

export const FOCUS_ICON: Record<ChatFocus, LucideIcon> = {
    screen: ShieldCheck,
    review: FileCheck,
    ownership: GitBranch,
    research: Globe,
    memo: FileText,
};
