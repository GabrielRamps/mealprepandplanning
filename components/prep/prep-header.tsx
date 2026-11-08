"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { href: "/prep/today", label: "Today" },
  { href: "/prep/week", label: "Week" },
  { href: "/prep/menu", label: "Menu" },
];

/** Prep's header: the title and Today / Week / Menu (PRD-prep 5). */
export function PrepHeader({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center px-2">
        <h1 className="px-2 text-xl font-semibold">Prep</h1>
        <div className="ml-auto flex items-center">{action}</div>
      </div>
      <nav aria-label="Prep" className="mx-auto max-w-2xl px-4 pb-2">
        <ul className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {SEGMENTS.map((s) => {
            const active = pathname === s.href || pathname.startsWith(`${s.href}/`) || (s.href === "/prep/menu" && pathname.startsWith("/prep/prices"));
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-lg text-sm font-medium",
                    active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
