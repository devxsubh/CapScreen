"use client";

import { useRouter } from "next/navigation";
import { FileText, Table2 } from "lucide-react";
import {
  createEntityTabularReview,
  syncPortfolioGrid,
} from "@/api/portfolio";
import { IC_MEMO_CHAT_PROMPT } from "@/features/startups/lib/icMemoPrompt";
import type { ScreenerMessage } from "@/features/startups/lib/chatTypes";

interface Props {
  startupId: string;
  hasScreening: boolean;
  isChatLoading?: boolean;
  onRequestIcMemo: (message: ScreenerMessage) => void;
}

export function ScreeningFollowUpActions({
  startupId,
  hasScreening,
  isChatLoading = false,
  onRequestIcMemo,
}: Props) {
  const router = useRouter();

  if (!hasScreening) return null;

  async function openTabularReview() {
    try {
      const { reviewId } = await createEntityTabularReview(startupId);
      router.push(
        `/startups/${encodeURIComponent(startupId)}/tabular-reviews/${encodeURIComponent(reviewId)}`,
      );
    } catch {
      await syncPortfolioGrid().catch(() => {});
    }
  }

  function requestIcMemo() {
    onRequestIcMemo({
      role: "user",
      content: IC_MEMO_CHAT_PROMPT,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-4 py-2.5">
      <span className="text-xs text-gray-400 mr-1 shrink-0">Next steps</span>
      <button
        type="button"
        onClick={() => void openTabularReview()}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Table2 className="h-3.5 w-3.5 shrink-0" />
        Open tabular review
      </button>
      <button
        type="button"
        onClick={requestIcMemo}
        disabled={isChatLoading}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        IC compliance memo
      </button>
    </div>
  );
}
