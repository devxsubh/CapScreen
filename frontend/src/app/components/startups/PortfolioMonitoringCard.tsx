"use client";

import { useRouter } from "next/navigation";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { syncPortfolioGrid } from "@/lib/portfolioApi";

interface Props {
  compact?: boolean;
}

export function PortfolioMonitoringCard({ compact = false }: Props) {
  const router = useRouter();

  async function openPortfolioGrid() {
    try {
      const { reviewId } = await syncPortfolioGrid();
      router.push(`/tabular-reviews/${reviewId}`);
    } catch {
      router.push("/tabular-reviews");
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void openPortfolioGrid()}
        className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Portfolio grid
      </button>
    );
  }

  return (
    <div className="mx-4 md:mx-10 mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-900">
          Portfolio sanctions monitoring
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          All startups in one tabular grid — last screened, open flags, sanctioned
          exposure %, co-investor risk, and human sign-off.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void openPortfolioGrid()}
        className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 shadow-sm"
      >
        <LayoutGrid className="h-4 w-4" />
        Open portfolio grid
        <RefreshCw className="h-3 w-3 text-gray-400" />
      </button>
    </div>
  );
}
