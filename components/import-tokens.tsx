"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { createImportTokenAction, revokeImportTokenAction } from "@/app/(app)/import/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Token = { id: string; name: string; prefix: string; lastUsedAt: string | null };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : label}
    </Button>
  );
}

/** F1: personal tokens for the Shortcut. The full token shows once. */
export function ImportTokens({ tokens }: { tokens: Token[] }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {created ? (
        <div className="flex flex-col gap-2 rounded-lg bg-primary/10 p-3 text-sm" role="status">
          <p>
            <strong>Copy this token now.</strong> It won&apos;t be shown again. Paste it into the Shortcut&apos;s Authorization header as
            <code className="mx-1">Bearer</code> followed by the token.
          </p>
          <code className="rounded bg-background p-2 text-xs break-all" data-testid="new-token">
            {created}
          </code>
          <div className="flex gap-2">
            <CopyButton text={created} label="Copy token" />
            <CopyButton text={`Bearer ${created}`} label="Copy header value" />
          </div>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createImportTokenAction(name);
            if (result.token) {
              setCreated(result.token);
              setName("");
            } else setError(result.error ?? "Couldn't create a token. Try again.");
          });
        }}
      >
        <Label htmlFor="token-name">New token</Label>
        <div className="flex gap-2">
          <Input id="token-name" placeholder="My iPhone" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={pending || !name.trim()}>
            <KeyRound aria-hidden /> Create token
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>

      {tokens.length ? (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Your tokens">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex flex-col">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.prefix}… · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "not used yet"}
                </span>
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() =>
                  confirming === t.id ? startTransition(() => revokeImportTokenAction(t.id)) : setConfirming(t.id)
                }
              >
                {confirming === t.id ? "Tap again to revoke" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CopyAppUrl({ url }: { url: string }) {
  return <CopyButton text={url} label="Copy import URL" />;
}
