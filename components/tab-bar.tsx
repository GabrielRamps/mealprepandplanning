"use client";

import { BookOpen, CalendarDays, Download, ShoppingCart, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function TabBar() {
  const pathname = usePathname();

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
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
