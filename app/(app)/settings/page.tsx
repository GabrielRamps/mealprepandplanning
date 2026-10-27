import type { Metadata } from "next";
import { headers } from "next/headers";
import { signOutAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/page-header";
import { CopyAppUrl, ImportTokens } from "@/components/import-tokens";
import { ShareCodeButton } from "@/components/share-code-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMembers, MAX_HOUSEHOLD_MEMBERS, requireHousehold } from "@/lib/household";
import { listTokens } from "@/lib/import/tokens";
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
  const [members, tokens] = await Promise.all([getMembers(membership.householdId), listTokens(membership.householdId, user.id)]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const appUrl = process.env.APP_URL || (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "");
  const importUrl = `${appUrl}/api/import`;
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

        <Card id="shortcut">
          <CardHeader>
            <CardTitle className="text-lg">iPhone Shortcut</CardTitle>
            <CardDescription>
              Send recipes from the share button in Instagram, TikTok, Safari or Photos. Each person makes their own token, named for their phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ImportTokens
              tokens={tokens.map((t) => ({ ...t, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))}
            />
            <div className="flex flex-col gap-2 text-sm">
              <p>
                Import URL: <code className="break-all">{importUrl}</code>
              </p>
              <CopyAppUrl url={importUrl} />
            </div>
            <ShortcutSteps importUrl={importUrl} />
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

/** PRD 10.2 and 10.3, as the user builds them in the Shortcuts app. */
function ShortcutSteps({ importUrl }: { importUrl: string }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <details className="rounded-lg border p-3">
        <summary className="min-h-8 cursor-pointer font-medium">&ldquo;Save Recipe&rdquo; for links</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Shortcuts app → <strong>+</strong> → name it <strong>Save Recipe</strong>.</li>
          <li>
            Open its details (ⓘ) → turn on <strong>Show in Share Sheet</strong> → share sheet types: <strong>URLs, Safari web pages, Text</strong>.
          </li>
          <li>Add <strong>Get URLs from Input</strong> (input: Shortcut Input).</li>
          <li>
            Add <strong>Get Contents of URL</strong>: URL <code className="break-all">{importUrl}</code>; Method <strong>POST</strong>; Headers:{" "}
            <code>Authorization</code> = <code>Bearer mpt_…</code> (your token above); Request Body <strong>JSON</strong>, key{" "}
            <code>url</code> = <strong>URLs</strong>.
          </li>
          <li>
            Add <strong>Show Notification</strong>: &ldquo;Recipe sent to Meal Planner.&rdquo;
          </li>
        </ol>
      </details>
      <details className="rounded-lg border p-3">
        <summary className="min-h-8 cursor-pointer font-medium">&ldquo;Save Recipe Photo&rdquo; for a screenshot or photo</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            New Shortcut <strong>Save Recipe Photo</strong> → <strong>Show in Share Sheet</strong> → types: <strong>Images</strong>.
          </li>
          <li>Add <strong>Resize Image</strong> to width 1600 (height auto).</li>
          <li>Add <strong>Convert Image</strong> to JPEG.</li>
          <li>
            Add <strong>Get Contents of URL</strong>: same URL and header; Request Body <strong>Form</strong>, field <code>images</code>, type{" "}
            <strong>File</strong>, value <strong>Converted Image</strong>.
          </li>
          <li>
            Add <strong>Show Notification</strong>.
          </li>
        </ol>
        <p className="mt-2 text-muted-foreground">For recipes over several pages, use Add photos on the Import tab instead.</p>
      </details>
    </div>
  );
}
