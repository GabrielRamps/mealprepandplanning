"use client";

import { Check, Share } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Opens the share sheet on phones; copies the code where sharing isn't available. */
export function ShareCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = `Join our household on Meal Planner with code ${code}: ${window.location.origin}/auth/sign-up`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" onClick={share} className="flex-1">
      {copied ? <Check aria-hidden /> : <Share aria-hidden />}
      {copied ? "Copied" : "Share code"}
    </Button>
  );
}
