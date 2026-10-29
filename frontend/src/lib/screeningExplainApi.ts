import type { EntityResult } from "@/lib/screenerTypes";
import { apiBase } from "@/lib/apiBase";

const API_BASE = apiBase();

export async function fetchEntityExplanation(
  entity: EntityResult,
  startupName?: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/screen/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: entity.name,
      type: entity.type,
      role: entity.role,
      riskLevel: entity.riskLevel,
      matches: entity.matches,
      ownershipPath: entity.ownershipPath,
      indirectOwnershipPct: entity.indirectOwnershipPct,
      exposureStatement: entity.exposureStatement,
      ownershipRuleFlags: entity.ownershipRuleFlags,
      startupName,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? "Failed to load entity analysis");
  }
  const data = (await res.json()) as { explanation: string };
  return data.explanation;
}
