// Small shared pieces for Prep screens: status pills, eater lines, money.
import type { ReactNode } from "react";
import type { Status } from "@/lib/prep/types";
import { cn } from "@/lib/utils";

export const STATUS_CLASS: Record<Status, string> = {
  green: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  red: "bg-red-500/10 text-red-800 dark:text-red-300",
};

export const STATUS_WORD: Record<Status, string> = { green: "on target", amber: "close", red: "off" };

/** A number with its status color; the words always say it too (PRD-prep 12). */
export function StatusPill({ status, children, className }: { status: Status | null; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium tabular-nums",
        status ? STATUS_CLASS[status] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const EATER_COLOR: Record<"a" | "b" | "neutral", string> = {
  a: "text-primary",
  b: "text-sky-700 dark:text-sky-400",
  neutral: "text-muted-foreground",
};

export type Plate = {
  eaterId: string;
  name: string;
  color: "a" | "b" | "neutral";
  lines: { text: string; spoken: string }[];
};

/** "Gabriel 6 oz cooked chicken · 250 g sweet potato…", read as "Gabriel, 6 ounces cooked chicken…". */
export function EaterLine({ plate }: { plate: Plate }) {
  const spoken = `${plate.name}, ${plate.lines.map((l) => l.spoken).join(", ")}`;
  return (
    <p className="text-sm leading-relaxed" aria-label={spoken}>
      <span className={cn("font-semibold", EATER_COLOR[plate.color])}>{plate.name}</span>{" "}
      <span aria-hidden>{plate.lines.map((l) => l.text).join(" · ") || "nothing"}</span>
    </p>
  );
}
