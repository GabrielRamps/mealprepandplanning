"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { AISLES } from "@/lib/enums";
import { isAisleOrder } from "@/lib/grocery/aisles";
import { setAisleOrder, updateIngredient } from "@/lib/grocery/ingredients";
import { requireHousehold, withNewInviteCode } from "@/lib/household";

/** PRD F2: any member can replace the invite code; the old one stops working. */
export async function regenerateInviteCodeAction(): Promise<void> {
  const { membership } = await requireHousehold();
  await withNewInviteCode((inviteCode, inviteExpiresAt) =>
    getDb()
      .update(schema.households)
      .set({ inviteCode, inviteExpiresAt })
      .where(eq(schema.households.id, membership.householdId)),
  );
  revalidatePath("/settings");
}

export type SettingResult = { ok: true } | { ok: false; error: string };

/** PRD F2: the order lists group aisles in, to match the household's store. */
export async function setAisleOrderAction(order: unknown): Promise<SettingResult> {
  const { membership } = await requireHousehold();
  if (!isAisleOrder(order)) return { ok: false, error: "That aisle order is missing an aisle. Reload and try again." };
  await setAisleOrder(membership.householdId, order);
  revalidatePath("/settings");
  return { ok: true };
}

const IngredientPatch = z
  .object({ aisle: z.enum(AISLES).optional(), isPantryStaple: z.boolean().optional() })
  .strict()
  .refine((p) => p.aisle !== undefined || p.isPantryStaple !== undefined);

/** PRD F2: an ingredient's aisle and pantry-staple flag, for every future list. */
export async function updateIngredientAction(ingredientId: unknown, patch: unknown): Promise<SettingResult> {
  const { membership } = await requireHousehold();
  const id = z.uuid().safeParse(ingredientId);
  const parsed = IngredientPatch.safeParse(patch);
  if (!id.success || !parsed.success) return { ok: false, error: "That change couldn't be saved." };
  const saved = await updateIngredient(membership.householdId, id.data, parsed.data);
  if (!saved) return { ok: false, error: "That ingredient isn't in your household any more." };
  return { ok: true };
}
