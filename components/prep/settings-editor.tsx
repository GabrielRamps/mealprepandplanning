"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplateAction, renameTemplateAction, saveSettingsAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PREP_DAY_LABELS } from "@/lib/prep/labels";
import type { Settings, TemplateRecord } from "@/lib/prep/load";
import { cn } from "@/lib/utils";

/** Settings (PRD-prep 5): budget, prep days, double-dinner days, guests and the rotation. */
export function SettingsEditor({ settings, templates }: { settings: Settings; templates: TemplateRecord[] }) {
  const router = useRouter();
  const [budget, setBudget] = useState((settings.weeklyBudgetCents / 100).toString());
  const [prepDays, setPrepDays] = useState(settings.prepWeekdays);
  const [doubles, setDoubles] = useState(settings.doubleWeekdays);
  const [guests, setGuests] = useState(settings.guestsDefault);
  const inRotation = settings.rotation.filter((id) => templates.some((t) => t.id === id));
  const [rotation, setRotation] = useState(inRotation);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (list: number[], d: number) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b));
  const move = (i: number, by: number) => {
    const next = [...rotation];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    setRotation(next);
  };
  const name = (id: string) => templates.find((t) => t.id === id)?.name ?? "Template";
  const excluded = templates.filter((t) => !rotation.includes(t.id));

  function save() {
    setError(null);
    setSaved(false);
    const cents = Math.round(Number(budget.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents)) return setError("Type the budget in dollars, like 175");
    startTransition(async () => {
      const result = await saveSettingsAction({ weeklyBudgetCents: cents, prepWeekdays: prepDays, doubleWeekdays: doubles, guestsDefault: guests, rotation });
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budget">Weekly grocery budget</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input id="budget" inputMode="decimal" className="w-32" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">New weeks keep the budget they started with.</p>
      </div>

      <DayPicker
        legend="Prep days"
        hint="Each prep day covers the days after it until the next one. Sun (before) is the Sunday before the week."
        days={[0, 1, 2, 3, 4, 5, 6]}
        value={prepDays}
        onToggle={(d) => setPrepDays(toggle(prepDays, d))}
      />
      <DayPicker
        legend="Double dinners on blank weeks"
        hint="New dinners on these days start with Double on."
        days={[1, 2, 3, 4, 5, 6]}
        value={doubles}
        onToggle={(d) => setDoubles(toggle(doubles, d))}
      />
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-primary" checked={guests} onChange={(e) => setGuests(e.target.checked)} />
        <span>
          Guests at dinner by default
          <span className="block text-xs text-muted-foreground">For new weeks; each week has its own switch.</span>
        </span>
      </label>

      <section aria-labelledby="rotation-heading" className="flex flex-col gap-2">
        <h2 id="rotation-heading" className="font-semibold">
          Rotation
        </h2>
        <p className="text-xs text-muted-foreground">New weeks suggest the template after the one used last. Templates left out aren&apos;t suggested.</p>
        <ol className="flex flex-col divide-y rounded-xl border">
          {rotation.map((id, i) => (
            <li key={id} className="flex min-h-12 items-center gap-1 px-2">
              <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
              <TemplateName id={id} name={name(id)} />
              <Button variant="ghost" size="icon" aria-label={`Move ${name(id)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Move ${name(id)} down`} disabled={i === rotation.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRotation(rotation.filter((x) => x !== id))}>
                Leave out
              </Button>
            </li>
          ))}
        </ol>
        {excluded.length ? (
          <>
            <h3 className="text-sm font-medium">Not suggested</h3>
            <ul className="flex flex-col divide-y rounded-xl border">
              {excluded.map((t) => (
                <li key={t.id} className="flex min-h-12 items-center gap-1 px-2">
                  <TemplateName id={t.id} name={t.name} />
                  <Button variant="ghost" size="sm" onClick={() => setRotation([...rotation, t.id])}>
                    Add to rotation
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="lg" disabled={pending} onClick={save}>
        {pending ? "Saving…" : saved ? "Saved" : "Save settings"}
      </Button>
    </div>
  );
}

function DayPicker({ legend, hint, days, value, onToggle }: { legend: string; hint: string; days: number[]; value: number[]; onToggle: (d: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {days.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(d)}
              className={cn("min-h-11 min-w-11 rounded-lg border px-2 text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {PREP_DAY_LABELS[d]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  );
}

/** A template's name, renamed or deleted in place. */
function TemplateName({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  if (editing) {
    return (
      <form
        className="flex flex-1 gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await renameTemplateAction(id, value);
            if (!r.error) {
              setEditing(false);
              router.refresh();
            }
          });
        }}
      >
        <Input aria-label="Template name" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} autoFocus />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          aria-label={`Delete ${name}`}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            startTransition(async () => {
              await deleteTemplateAction(id);
              router.refresh();
            });
          }}
        >
          <Trash2 className="size-4" aria-hidden /> {confirm ? "Sure?" : ""}
        </Button>
      </form>
    );
  }
  return (
    <span className="flex flex-1 items-center gap-1">
      <span className="flex-1 text-sm font-medium">{name}</span>
      <Button variant="ghost" size="icon" aria-label={`Rename ${name}`} onClick={() => setEditing(true)}>
        <Pencil className="size-4" />
      </Button>
    </span>
  );
}
