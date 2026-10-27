// Plan approval rules (PRD D2, D3). Pure so the server actions and the screen
// agree on what each person may do.

export type PlanStatus = "draft" | "pending_approval" | "approved";
export type PlanState = { status: PlanStatus; sentBy: string | null };

/** While a plan waits for approval, only the partner (not the sender) edits it. */
export function canEdit(plan: PlanState | null, userId: string): boolean {
  if (!plan) return true;
  return plan.status !== "pending_approval" || plan.sentBy !== userId;
}

/** Sending needs a draft with at least one meal on it. */
export function canSend(plan: PlanState | null, entryCount: number): boolean {
  return (plan?.status ?? "draft") === "draft" && entryCount > 0;
}

/** Approve or request changes: only the partner of the person who sent it. */
export function canReview(plan: PlanState | null, userId: string): boolean {
  return plan?.status === "pending_approval" && plan.sentBy !== null && plan.sentBy !== userId;
}

/** Status after someone edits the meals: an approved plan goes back to draft (D3). */
export function statusAfterEdit(status: PlanStatus): PlanStatus {
  return status === "approved" ? "draft" : status;
}
