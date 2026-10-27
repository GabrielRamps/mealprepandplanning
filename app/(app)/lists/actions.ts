"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AISLES } from "@/lib/enums";
import { parseItemText } from "@/lib/grocery/item-text";
import {
  addManualItem,
  createList,
  deleteItem,
  type ItemPatch,
  ListBuildError,
  type ListItem,
  listInHousehold,
  setItemChecked,
  setListStatus,
  updateItem,
} from "@/lib/grocery/lists";
import { requireHousehold } from "@/lib/household";
import { UNIT_CODES } from "@/lib/units";

const NewList = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(80, "Keep the name under 80 characters"),
  picks: z
    .array(z.object({ recipeId: z.uuid(), servings: z.number().positive().max(200) }))
    .min(1, "Pick at least one recipe")
    .max(50),
});

export type NewListResult = { error?: string } | null;

/** createListFromRecipes (PRD 9.2). */
export async function createListFromRecipesAction(input: z.input<typeof NewList>): Promise<NewListResult> {
  const { user, membership } = await requireHousehold();
  const parsed = NewList.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let listId: string;
  try {
    listId = await createList({
      householdId: membership.householdId,
      userId: user.id,
      name: parsed.data.name,
      picks: parsed.data.picks,
    });
  } catch (err) {
    if (err instanceof ListBuildError) return { error: err.message };
    throw err;
  }
  revalidatePath("/lists");
  redirect(`/lists/${listId}`);
}

async function requireList(listId: string) {
  const ctx = await requireHousehold();
  if (!(await listInHousehold(ctx.membership.householdId, listId))) notFound();
  return ctx;
}

/** Check or uncheck; returns the saved item so the screen can settle on it. */
export async function toggleItemAction(listId: string, itemId: string, checked: boolean): Promise<ListItem | null> {
  const { user } = await requireList(listId);
  return setItemChecked(listId, itemId, Boolean(checked), user.id);
}

const ManualItem = z.string().trim().min(1, "Type an item").max(120, "Keep it under 120 characters");

/** "2 lb apples" → amount, unit and name; aisle from a known ingredient or a guess. */
export async function addManualItemAction(listId: string, text: string): Promise<{ item?: ListItem; error?: string }> {
  const { membership } = await requireList(listId);
  const parsed = ManualItem.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, quantity, unit } = parseItemText(parsed.data);
  const item = await addManualItem(membership.householdId, listId, { name, quantity, unit, aisle: null });
  return { item };
}

const Patch = z
  .object({
    name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().max(100_000).nullable(),
    unit: z.enum(UNIT_CODES).nullable(),
    aisle: z.enum(AISLES),
    isPantry: z.boolean(),
  })
  .partial();

export async function updateItemAction(listId: string, itemId: string, patch: ItemPatch): Promise<ListItem | null> {
  const { membership } = await requireList(listId);
  const parsed = Patch.safeParse(patch);
  if (!parsed.success) return null;
  return updateItem(membership.householdId, listId, itemId, parsed.data);
}

export async function deleteItemAction(listId: string, itemId: string): Promise<void> {
  await requireList(listId);
  await deleteItem(listId, itemId);
}

export async function setListStatusAction(listId: string, status: "active" | "completed"): Promise<void> {
  if (status !== "active" && status !== "completed") return;
  const { membership } = await requireList(listId);
  await setListStatus(membership.householdId, listId, status);
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}
