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
  deleteList,
  getList,
  type ItemPatch,
  ListBuildError,
  type ListItem,
  listInHousehold,
  type ListStatus,
  rebuildList,
  setItemChecked,
  setListStatus,
  updateItem,
} from "@/lib/grocery/lists";
import {
  deleteSavedList,
  renameSavedList,
  reorderSavedList,
  saveListAs,
  SavedListError,
} from "@/lib/grocery/saved";
import { listsHref, tabForStatus } from "@/lib/grocery/tabs";
import { requireHousehold } from "@/lib/household";
import { getPlan, planPicks } from "@/lib/plan/plans";
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

/**
 * Done shopping (the list moves to History) or reopen it. From the Lists
 * screen pass `backToLists`; from the list itself, the list stays on screen.
 */
export async function setListStatusAction(listId: string, status: ListStatus, backToLists = false): Promise<void> {
  if (status !== "active" && status !== "completed") return;
  const { membership } = await requireList(listId);
  await setListStatus(membership.householdId, listId, status);
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  // Back to the view the list just left, with a note saying where it went.
  if (backToLists === true) {
    redirect(status === "completed" ? listsHref("active", "moved-to-history") : listsHref("history", "reopened"));
  }
}

/**
 * Deletes a list for both people, then shows the Lists view it was in with
 * "List deleted." Already gone (the other phone deleted it) ends the same way.
 */
export async function deleteListAction(listId: string): Promise<void> {
  const { membership } = await requireHousehold();
  const status = await deleteList(membership.householdId, listId);
  revalidatePath("/lists");
  redirect(listsHref(tabForStatus(status ?? "active"), "list-deleted"));
}

const SavedName = z.string().trim().min(1, "Give it a name").max(80, "Keep the name under 80 characters");

export type SaveListResult = { error?: string; savedListId?: string; name?: string };

/** Save for reorder: the list's recipes, servings and added items, under a name. `update` replaces its linked saved list. */
export async function saveListAction(listId: string, name: string, update: boolean): Promise<SaveListResult> {
  const { user, membership } = await requireList(listId);
  const parsed = SavedName.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let savedListId: string;
  try {
    savedListId = await saveListAs({
      householdId: membership.householdId,
      userId: user.id,
      listId,
      name: parsed.data,
      update: update === true,
    });
  } catch (err) {
    if (err instanceof SavedListError) return { error: err.message };
    throw err;
  }
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  return { savedListId, name: parsed.data };
}

/** Reorder: a fresh active list from a saved list, then open it. */
export async function reorderSavedListAction(savedListId: string): Promise<{ error?: string }> {
  const { user, membership } = await requireHousehold();
  let listId: string;
  try {
    listId = await reorderSavedList({ householdId: membership.householdId, userId: user.id, savedListId });
  } catch (err) {
    if (err instanceof SavedListError || err instanceof ListBuildError) return { error: err.message };
    throw err;
  }
  revalidatePath("/lists");
  redirect(`/lists/${listId}`);
}

export async function renameSavedListAction(savedListId: string, name: string): Promise<{ error?: string }> {
  const { membership } = await requireHousehold();
  const parsed = SavedName.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await renameSavedList(membership.householdId, savedListId, parsed.data))) return { error: "That saved list was deleted." };
  revalidatePath("/lists");
  return {};
}

/** Deletes a saved list for both people. Lists already made from it stay. */
export async function deleteSavedListAction(savedListId: string): Promise<void> {
  const { membership } = await requireHousehold();
  await deleteSavedList(membership.householdId, savedListId);
  revalidatePath("/lists");
  redirect(listsHref("reorder", "saved-deleted"));
}

/** "Plan changed — update list?" (PRD 8.4): rebuild from the plan, keeping checks and manual items. */
export async function rebuildListAction(listId: string): Promise<{ error?: string }> {
  const { membership } = await requireList(listId);
  const list = await getList(membership.householdId, listId);
  const plan = list?.mealPlanId ? await getPlan(membership.householdId, list.mealPlanId) : null;
  if (!plan) return { error: "This list isn't linked to a plan anymore." };
  await rebuildList(membership.householdId, listId, planPicks(plan));
  revalidatePath(`/lists/${listId}`);
  return {};
}
