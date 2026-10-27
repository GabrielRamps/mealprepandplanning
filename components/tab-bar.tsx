"use client";

import { BookOpen, CalendarDays, Download, ShoppingCart, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon; alsoActiveFor?: string[] };

// PRD 5: four tabs; Settings opens from the Recipes header, so it lights Recipes.
const TABS: Tab[] = [
  { href: "/recipes", label: "Recipes", icon: BookOpen, alsoActiveFor: ["/settings"] },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/lists", label: "Lists", icon: ShoppingCart },
  { href: "/import", label: "Import", icon: Download },
];

function isActive(pathname: string, tab: Tab): boolean {
  return [tab.href, ...(tab.alsoActiveFor ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Fired after a plan is sent or reviewed, so the badge updates at once. */
export const PLANS_CHANGED = "plans-changed";

/** Plans waiting for my answer (PRD D2), refreshed on navigation, focus and every minute. */
function useWaitingCount(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/plans/waiting", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { count: number } | null) => {
          if (!cancelled && d) setCount(d.count);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(PLANS_CHANGED, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(PLANS_CHANGED, load);
    };
  }, [pathname]);
  return count;
}

export function TabBar() {
  const pathname = usePathname();
  const waiting = useWaitingCount(pathname);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-2xl grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {tab.href === "/plan" && waiting > 0 ? (
                    <span
                      className="absolute -top-1.5 -right-2.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[0.7rem] leading-5 font-semibold text-white"
                      data-testid="plan-badge"
                    >
                      {waiting}
                    </span>
                  ) : null}
                </span>
                {tab.label}
                {tab.href === "/plan" && waiting > 0 ? <span className="sr-only">, {waiting} waiting for your approval</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
