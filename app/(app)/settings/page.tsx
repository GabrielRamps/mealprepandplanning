import type { Metadata } from "next";
import { signOutAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/page-header";
import { ShareCodeButton } from "@/components/share-code-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMembers, MAX_HOUSEHOLD_MEMBERS, requireHousehold } from "@/lib/household";
import { regenerateInviteCodeAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Works for 6 more days", counted from now so it reads right in any time zone. */
function inviteStatus(expiresAt: Date | null): { valid: boolean; text: string } {
  const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : 0;
  if (msLeft <= 0) return { valid: false, text: "This code has expired. Make a new one to invite someone." };
  const days = Math.ceil(msLeft / DAY_MS);
  return { valid: true, text: `Works for ${days} more ${days === 1 ? "day" : "days"}.` };
}

export default async function SettingsPage() {
  const { user, membership } = await requireHousehold();
  const members = await getMembers(membership.householdId);
  const invite = inviteStatus(membership.inviteExpiresAt);
  const full = members.length >= MAX_HOUSEHOLD_MEMBERS;

  return (
    <>
      <PageHeader title="Settings" back={{ href: "/recipes", label: "Recipes" }} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{membership.householdName}</CardTitle>
            <CardDescription>
              {members.length} of {MAX_HOUSEHOLD_MEMBERS} members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {members.map((m) => (
                <li key={m.userId} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <span className="font-medium">
                    {m.displayName}
                    {m.userId === user.id ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                  </span>
                  {m.role === "owner" ? <span className="text-sm text-muted-foreground">Owner</span> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite code</CardTitle>
            <CardDescription>
              {full
                ? "Your household is full."
                : "Your partner signs up, picks “Join with code” and enters this code."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invite.valid && membership.inviteCode ? (
              <p className="font-mono text-4xl font-semibold tracking-[0.25em]" aria-label="Invite code">
                {membership.inviteCode}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">{invite.text}</p>
            <div className="flex gap-2">
              {invite.valid && membership.inviteCode ? <ShareCodeButton code={membership.inviteCode} /> : null}
              <form action={regenerateInviteCodeAction} className="flex flex-1">
                <Button type="submit" variant="outline" className="flex-1">
                  New code
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>
              Signed in as {user.name} ({user.email})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
