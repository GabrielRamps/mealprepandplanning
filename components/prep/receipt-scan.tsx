"use client";

import { Camera, ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { applyReceiptScanAction, startReceiptScanAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scanTotal, type Suggestion, suggestPackagePrice } from "@/lib/import/receipt-ai";
import { formatMoney, formatWeight } from "@/lib/prep/format";
import type { Scan } from "@/lib/prep/receipts";
import { resizeImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";

const MAX = 4;

/** 1–4 photos from the camera or library, shrunk on the phone first (as imports do). */
export function ReceiptUpload() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (files.length > MAX) return setError(`Pick up to ${MAX} photos for one receipt.`);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      for (const f of await Promise.all(files.map((f) => resizeImage(f, 2000, 0.85)))) fd.append("images", f);
      const result = await startReceiptScanAction(fd);
      if (result.scanId) router.push(`/prep/prices/scan/${result.scanId}`);
      else setError(result.error ?? "Couldn't start the scan. Try again.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => camera.current?.click()}>
          <Camera aria-hidden /> Take photo
        </Button>
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => library.current?.click()}>
          <ImagePlus aria-hidden /> Choose photos
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" onChange={(e) => onFiles(e.target.files)} />
      <input ref={library} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => onFiles(e.target.files)} />
      {pending ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type FoodOption = {
  id: string;
  name: string;
  unitKind: "weight" | "count";
  gramsPerCount: number | null;
  packageAmount: number;
  packageLabel: string;
  packagePriceCents: number;
  priceIsEstimate: boolean;
};

type Row = { foodId: string | null; ignored: boolean; apply: boolean; price: string; suggestion: Suggestion | null };

const sizeText = (food: FoodOption, amount: number) => (food.unitKind === "count" ? `${amount} ct` : formatWeight(amount));

export function ReceiptReview({
  scan,
  foods,
  suggestions,
  weekEstimateCents,
  weekStart,
}: {
  scan: Scan;
  foods: FoodOption[];
  suggestions: (Suggestion | null)[];
  weekEstimateCents: number | null;
  weekStart: string | null;
}) {
  const router = useRouter();
  const byId = new Map(foods.map((f) => [f.id, f]));
  const [rows, setRows] = useState<Row[]>(() =>
    scan.lines.map((l, i) => {
      const s = suggestions[i];
      return { foodId: l.core_food_id, ignored: false, apply: Boolean(l.core_food_id && s && !s.warning), price: s ? (s.packagePriceCents / 100).toFixed(2) : "", suggestion: s };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // While Claude reads it, check every 2 s.
  useEffect(() => {
    if (scan.status !== "processing") return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [scan.status, router]);

  if (scan.status === "processing") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-3 p-8 text-center">
        <p className="text-lg font-medium">Reading the receipt…</p>
        <p className="text-muted-foreground">This usually takes under a minute.</p>
      </main>
    );
  }
  if (scan.status === "failed") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-3 p-8 text-center">
        <p className="text-lg font-medium">{scan.error ?? "Couldn't read that receipt — try a clearer photo."}</p>
        <Button asChild>
          <Link href="/prep/prices/scan">Try again</Link>
        </Button>
      </main>
    );
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const match = (i: number, foodId: string) => {
    if (foodId === "ignore") return setRow(i, { ignored: true, apply: false, foodId: null });
    const food = byId.get(foodId);
    if (!food) return setRow(i, { foodId: null, apply: false, suggestion: null, ignored: false });
    const s = suggestPackagePrice(scan.lines[i], food);
    setRow(i, { foodId, ignored: false, suggestion: s, price: (s.packagePriceCents / 100).toFixed(2), apply: !s.warning });
  };
  const total = scanTotal(scan.lines);
  const chosen = rows.flatMap((r, i) => (r.apply && r.foodId && r.suggestion ? [{ r, i }] : []));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <p className="rounded-xl bg-muted p-3 text-sm">
        {scan.store ?? "Receipt"}: <strong className="tabular-nums">{formatMoney(total)}</strong> across {scan.lines.length} lines
        {scan.receiptTotalCents !== null ? ` (receipt total ${formatMoney(scan.receiptTotalCents)})` : ""}.
        {weekEstimateCents !== null ? (
          <>
            {" "}
            The{" "}
            <Link href={`/prep/week/${weekStart}`} className="underline">
              week&apos;s estimate
            </Link>{" "}
            is <strong className="tabular-nums">{formatMoney(weekEstimateCents)}</strong>.
          </>
        ) : null}
      </p>
      {scan.appliedAt ? <p className="rounded-xl bg-primary/10 p-3 text-sm">These prices were applied.</p> : null}
      {done !== null ? (
        <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">
          Updated {done} food{done === 1 ? "" : "s"}. Their estimate badges are gone, and every week&apos;s totals use the new prices.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {scan.lines.map((l, i) => {
          const row = rows[i];
          const food = row.foodId ? byId.get(row.foodId) : undefined;
          return (
            <li key={i} className={cn("flex flex-col gap-2 rounded-xl border p-3", row.ignored && "opacity-60")} data-testid="receipt-line">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm">{l.raw_text}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(l.line_total_cents)}
                  {l.quantity > 1 ? <span className="block text-xs font-normal text-muted-foreground">{l.quantity} × {formatMoney(l.unit_price_cents)}</span> : null}
                </span>
              </div>
              <select
                aria-label={`Match ${l.raw_text}`}
                value={row.ignored ? "ignore" : (row.foodId ?? "")}
                disabled={Boolean(scan.appliedAt)}
                onChange={(e) => match(i, e.target.value)}
                className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
              >
                <option value="">No match — match to…</option>
                <option value="ignore">Ignore</option>
                {foods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {food && row.suggestion ? (
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">
                    Now {formatMoney(food.packagePriceCents)} · {food.packageLabel}
                    {food.priceIsEstimate ? " (estimate)" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={row.apply}
                        disabled={Boolean(scan.appliedAt)}
                        onChange={(e) => setRow(i, { apply: e.target.checked })}
                      />
                      Apply
                    </label>
                    <span>$</span>
                    <Input aria-label="New package price" inputMode="decimal" className="w-24" value={row.price} onChange={(e) => setRow(i, { price: e.target.value })} />
                    <span className="text-muted-foreground">for {sizeText(food, row.suggestion.packageAmount)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{row.suggestion.basis}</span>
                  {row.suggestion.warning ? <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{row.suggestion.warning}</span> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!scan.appliedAt ? (
        <Button
          size="lg"
          disabled={pending || chosen.length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const lines = chosen.map(({ r, i }) => ({
                lineIndex: i,
                coreFoodId: r.foodId!,
                packagePriceCents: Math.round(Number(r.price.replace(/[$,]/g, "")) * 100),
                packageAmount: r.suggestion!.packageAmount,
              }));
              if (lines.some((l) => !Number.isFinite(l.packagePriceCents))) return setError("Check the prices: type them like 11.97.");
              const result = await applyReceiptScanAction(scan.id, lines);
              if (result.error) setError(result.error);
              else {
                setDone(result.updated ?? 0);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Applying…" : `Apply ${chosen.length} price${chosen.length === 1 ? "" : "s"}`}
        </Button>
      ) : null}
    </main>
  );
}
