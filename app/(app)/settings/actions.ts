"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/lib/db";
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
