"use client";

import { ArrowDown, ArrowUp, Camera, EllipsisVertical, ImageOff, Plus, Trash2, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { saveRecipeAction } from "@/app/(app)/recipes/actions";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseQuantity, quantityToInput } from "@/lib/quantity";
import { MAX_TAGS, type RecipeDraftInput, uniqueTags } from "@/lib/recipe-draft";
import { resizeImage } from "@/lib/resize-image";
import { PACKAGE_UNITS, type UnitCode, unitLabel, VOLUME_UNITS, WEIGHT_UNITS } from "@/lib/units";
import { cn } from "@/lib/utils";

/** What the editor starts from: blank, an existing recipe, or (later) an import draft. */
export type EditorInitial = {
  title: string;
  description: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  notes: string;
  sourceUrl: string;
  coverUrl: string | null;
  // Not editable; carried through so saving keeps the credit (PRD 12).
  creatorName: string | null;
  creatorHandle: string | null;
  ingredients: {
    section: string | null;
    quantity: number | null;
    quantityMax: number | null;
    unit: UnitCode | null;
    name: string;
    prepNote: string | null;
    isOptional: boolean;
  }[];
  steps: { section: string | null; text: string }[];
  tags: string[];
};

export const BLANK_RECIPE: EditorInitial = {
  title: "",
  description: "",
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  notes: "",
  sourceUrl: "",
  coverUrl: null,
  creatorName: null,
  creatorHandle: null,
  ingredients: [],
  steps: [],
  tags: [],
};

// Lists hold section headers inline: rows after a header belong to it.
type SectionItem = { key: string; kind: "section"; title: string };
type IngredientItem = {
  key: string;
  kind: "ingredient";
  quantity: string;
  unit: UnitCode | "";
  name: string;
  prepNote: string;
  isOptional: boolean;
};
type StepItem = { key: string; kind: "step"; text: string };
type IngredientListItem = SectionItem | IngredientItem;
type StepListItem = SectionItem | StepItem;

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

const blankIngredient = (): IngredientItem => ({
  key: newKey(),
  kind: "ingredient",
  quantity: "",
  unit: "",
  name: "",
  prepNote: "",
  isOptional: false,
});
const blankStep = (): StepItem => ({ key: newKey(), kind: "step", text: "" });
const blankSection = (): SectionItem => ({ key: newKey(), kind: "section", title: "" });

/** Flat rows with a section each → list items with headers where the section changes. */
function withHeaders<T extends { section: string | null }, I>(rows: T[], toItem: (row: T) => I): (SectionItem | I)[] {
  const items: (SectionItem | I)[] = [];
  let current: string | null = null;
  for (const row of rows) {
    if (row.section !== current) {
      items.push({ key: newKey(), kind: "section", title: row.section ?? "" });
      current = row.section;
    }
    items.push(toItem(row));
  }
  return items;
}

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function intOrNull(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : "invalid";
}

const TOP_LEVEL_FIELDS: Record<string, string> = {
  "draft.title": "title",
  "draft.description": "description",
  "draft.servings": "servings",
  "draft.prep_minutes": "prep",
  "draft.cook_minutes": "cook",
  "draft.tags": "tags",
  "draft.notes": "notes",
  source_url: "sourceUrl",
  cover: "cover",
};

/** Server error paths ("draft.ingredients.2.name") → the editor's error keys. */
function errorKey(path: string, ingredientKeys: string[], stepKeys: string[]): string {
  const [root, list, index, field] = path.split(".");
  if (root === "draft" && list === "ingredients" && index !== undefined) {
    const row = ingredientKeys[Number(index)];
    return field === "quantity" || field === "quantity_max" ? `${row}.quantity` : `${row}.name`;
  }
  if (root === "draft" && list === "steps" && index !== undefined) return `${stepKeys[Number(index)]}.text`;
  if (root === "draft" && list === "tags") return "tags";
  return TOP_LEVEL_FIELDS[path] ?? "form";
}

type CoverState = { mode: "keep" | "replace" | "remove"; previewUrl: string | null; file: File | null };

type Props = {
  recipeId: string | null;
  initial: EditorInitial;
  tagSuggestions: string[];
  cancelHref: string;
};

export function RecipeEditor({ recipeId, initial, tagSuggestions, cancelHref }: Props) {
  const formId = useId();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [servings, setServings] = useState(initial.servings === null ? "" : String(initial.servings));
  const [prep, setPrep] = useState(initial.prepMinutes === null ? "" : String(initial.prepMinutes));
  const [cook, setCook] = useState(initial.cookMinutes === null ? "" : String(initial.cookMinutes));
  const [notes, setNotes] = useState(initial.notes);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [tags, setTags] = useState(initial.tags);
  const [cover, setCover] = useState<CoverState>({ mode: "keep", previewUrl: initial.coverUrl, file: null });
  const [ingredients, setIngredients] = useState<IngredientListItem[]>(() => {
    const items = withHeaders(initial.ingredients, (i) => ({
      key: newKey(),
      kind: "ingredient" as const,
      quantity: quantityToInput(i.quantity, i.quantityMax),
      unit: i.unit ?? ("" as const),
      name: i.name,
      prepNote: i.prepNote ?? "",
      isOptional: i.isOptional,
    }));
    return items.length ? items : [blankIngredient(), blankIngredient(), blankIngredient()];
  });
  const [steps, setSteps] = useState<StepListItem[]>(() => {
    const items = withHeaders(initial.steps, (s) => ({ key: newKey(), kind: "step" as const, text: s.text }));
    return items.length ? items : [blankStep()];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Drops a field's error once it's edited, so fixed fields stop showing red. */
  function clearError(...keys: string[]) {
    setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  }

  function updateIngredient(key: string, patch: Partial<IngredientItem> | Partial<SectionItem>) {
    setIngredients((list) => list.map((item) => (item.key === key ? ({ ...item, ...patch } as IngredientListItem) : item)));
    clearError(`${key}.quantity`, `${key}.name`);
  }
  function updateStep(key: string, patch: Partial<StepItem> | Partial<SectionItem>) {
    setSteps((list) => list.map((item) => (item.key === key ? ({ ...item, ...patch } as StepListItem) : item)));
    clearError(`${key}.text`);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const resized = await resizeImage(file);
    setCover({ mode: "replace", previewUrl: URL.createObjectURL(resized), file: resized });
    clearError("cover");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors: Record<string, string> = {};

    const servingsValue = intOrNull(servings);
    if (servingsValue === null || servingsValue === "invalid") clientErrors.servings = "Enter servings from 1 to 50";
    const prepValue = intOrNull(prep);
    if (prepValue === "invalid") clientErrors.prep = "Whole minutes only";
    const cookValue = intOrNull(cook);
    if (cookValue === "invalid") clientErrors.cook = "Whole minutes only";

    // Blank rows are dropped; `sentKeys` maps server error indexes back to rows.
    const draftIngredients: RecipeDraftInput["ingredients"] = [];
    const ingredientKeys: string[] = [];
    let section: string | null = null;
    for (const item of ingredients) {
      if (item.kind === "section") {
        section = item.title.trim() || null;
        continue;
      }
      if (!item.name.trim() && !item.quantity.trim() && !item.prepNote.trim()) continue;
      const parsed = parseQuantity(item.quantity);
      if (!parsed) clientErrors[`${item.key}.quantity`] = "Use a number like 2, 1/2, 1 1/2 or 2-3";
      if (!item.name.trim()) clientErrors[`${item.key}.name`] = "Enter an ingredient";
      draftIngredients.push({
        section,
        raw_text: "",
        quantity: parsed?.quantity ?? null,
        quantity_max: parsed?.quantityMax ?? null,
        unit: item.unit || null,
        name: item.name,
        prep_note: item.prepNote,
        is_optional: item.isOptional,
        aisle: null,
      });
      ingredientKeys.push(item.key);
    }

    const draftSteps: RecipeDraftInput["steps"] = [];
    const stepKeys: string[] = [];
    section = null;
    for (const item of steps) {
      if (item.kind === "section") {
        section = item.title.trim() || null;
        continue;
      }
      if (!item.text.trim()) continue;
      draftSteps.push({ section, text: item.text });
      stepKeys.push(item.key);
    }

    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setFormError(null);
      return;
    }

    const draft: RecipeDraftInput = {
      title,
      description,
      servings: servingsValue as number,
      prep_minutes: prepValue as number | null,
      cook_minutes: cookValue as number | null,
      ingredients: draftIngredients,
      steps: draftSteps,
      tags,
      creator_name: initial.creatorName,
      creator_handle: initial.creatorHandle,
      notes,
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ id: recipeId, draft, source_url: sourceUrl, cover: cover.mode }));
    if (cover.mode === "replace" && cover.file) fd.set("cover", cover.file);

    setFormError(null);
    startTransition(async () => {
      const result = await saveRecipeAction(fd);
      if (!result) return;
      const mapped: Record<string, string> = {};
      let general = result.error ?? null;
      for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
        const key = errorKey(path, ingredientKeys, stepKeys);
        if (key === "form") general = message;
        else mapped[key] ??= message;
      }
      setErrors(mapped);
      setFormError(Object.keys(mapped).length ? null : general);
    });
  }

  const hasFieldErrors = Object.values(errors).some(Boolean);

  return (
    <>
      <PageHeader
        title={recipeId ? "Edit recipe" : "New recipe"}
        back={{ href: cancelHref, label: "Cancel" }}
        action={
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        }
      />
      <form id={formId} onSubmit={submit} noValidate className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
        <CoverPicker cover={cover} error={errors.cover} onPick={onPhoto} onRemove={() => setCover({ mode: "remove", previewUrl: null, file: null })} />

        <section className="flex flex-col gap-4">
          <Field label="Title" htmlFor="title" error={errors.title}>
            <Input id="title" value={title} onChange={(e) => {
              setTitle(e.target.value);
              clearError("title");
            }} maxLength={200} aria-invalid={!!errors.title || undefined} />
          </Field>
          <Field label="Description" htmlFor="description" hint="Optional" error={errors.description}>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Servings" htmlFor="servings" error={errors.servings}>
              <Input id="servings" inputMode="numeric" value={servings} onChange={(e) => {
              setServings(e.target.value);
              clearError("servings");
            }} aria-invalid={!!errors.servings || undefined} />
            </Field>
            <Field label="Prep min" htmlFor="prep" error={errors.prep}>
              <Input id="prep" inputMode="numeric" value={prep} onChange={(e) => {
              setPrep(e.target.value);
              clearError("prep");
            }} aria-invalid={!!errors.prep || undefined} />
            </Field>
            <Field label="Cook min" htmlFor="cook" error={errors.cook}>
              <Input id="cook" inputMode="numeric" value={cook} onChange={(e) => {
              setCook(e.target.value);
              clearError("cook");
            }} aria-invalid={!!errors.cook || undefined} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="text-lg font-semibold">Ingredients</h2>
          <ul className="flex flex-col gap-3">
            {ingredients.map((item, index) => (
              <li key={item.key}>
                {item.kind === "section" ? (
                  <SectionRow
                    item={item}
                    placeholder="Section, e.g. Sauce"
                    onChange={(t) => updateIngredient(item.key, { title: t })}
                    onMove={(by) => setIngredients((l) => move(l, index, by))}
                    onRemove={() => setIngredients((l) => l.filter((i) => i.key !== item.key))}
                  />
                ) : (
                  <IngredientRow
                    item={item}
                    errors={errors}
                    onChange={(patch) => updateIngredient(item.key, patch)}
                    onMove={(by) => setIngredients((l) => move(l, index, by))}
                    onRemove={() => setIngredients((l) => l.filter((i) => i.key !== item.key))}
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setIngredients((l) => [...l, blankIngredient()])}>
              <Plus aria-hidden /> Ingredient
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIngredients((l) => [...l, blankSection(), blankIngredient()])}>
              <Plus aria-hidden /> Section
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="text-lg font-semibold">Steps</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((item, index) => {
              const number = steps.slice(0, index + 1).filter((s) => s.kind === "step").length;
              return (
                <li key={item.key}>
                  {item.kind === "section" ? (
                    <SectionRow
                      item={item}
                      placeholder="Section, e.g. For the sauce"
                      onChange={(t) => updateStep(item.key, { title: t })}
                      onMove={(by) => setSteps((l) => move(l, index, by))}
                      onRemove={() => setSteps((l) => l.filter((i) => i.key !== item.key))}
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="mt-3 w-6 shrink-0 text-right font-semibold text-muted-foreground">{number}.</span>
                      <div className="flex flex-1 flex-col gap-1">
                        <Textarea
                          aria-label={`Step ${number}`}
                          value={item.text}
                          onChange={(e) => updateStep(item.key, { text: e.target.value })}
                          rows={2}
                          aria-invalid={!!errors[`${item.key}.text`] || undefined}
                        />
                        <FieldError message={errors[`${item.key}.text`]} />
                      </div>
                      <RowMenu
                        label={`Step ${number}`}
                        onMove={(by) => setSteps((l) => move(l, index, by))}
                        onRemove={() => setSteps((l) => l.filter((i) => i.key !== item.key))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setSteps((l) => [...l, blankStep()])}>
              <Plus aria-hidden /> Step
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSteps((l) => [...l, blankSection(), blankStep()])}>
              <Plus aria-hidden /> Section
            </Button>
          </div>
        </section>

        <TagsInput tags={tags} onChange={setTags} suggestions={tagSuggestions} error={errors.tags} />

        <section className="flex flex-col gap-4">
          <Field label="Notes" htmlFor="notes" hint="Optional" error={errors.notes}>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <Field label="Source link" htmlFor="source" hint="Optional" error={errors.sourceUrl}>
            <Input
              id="source"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={sourceUrl}
              onChange={(e) => {
              setSourceUrl(e.target.value);
              clearError("sourceUrl");
            }}
              aria-invalid={!!errors.sourceUrl || undefined}
            />
          </Field>
        </section>

        {hasFieldErrors || formError ? (
          <p role="alert" className="text-sm text-destructive">
            {hasFieldErrors ? "Check the highlighted fields." : formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save recipe"}
        </Button>
      </form>
    </>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function CoverPicker({
  cover,
  error,
  onPick,
  onRemove,
}: {
  cover: CoverState;
  error?: string;
  onPick: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        {cover.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: previews and bucket URLs
          <img src={cover.previewUrl} alt="Cover photo" className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <Camera className="size-8" aria-hidden />
            Add a cover photo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Cover photo"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {cover.previewUrl ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => input.current?.click()}>
            <Camera aria-hidden /> Change photo
          </Button>
          <Button type="button" variant="ghost" onClick={onRemove}>
            <ImageOff aria-hidden /> Remove
          </Button>
        </div>
      ) : null}
      <FieldError message={error} />
    </section>
  );
}

function RowMenu({
  label,
  onMove,
  onRemove,
  extra,
}: {
  label: string;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`${label} options`}>
          <EllipsisVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onMove(-1)}>
          <ArrowUp aria-hidden /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove(1)}>
          <ArrowDown aria-hidden /> Move down
        </DropdownMenuItem>
        {extra}
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 aria-hidden /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionRow({
  item,
  placeholder,
  onChange,
  onMove,
  onRemove,
}: {
  item: SectionItem;
  placeholder: string;
  onChange: (title: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Input
        aria-label="Section name"
        placeholder={placeholder}
        value={item.title}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        className="font-semibold"
      />
      <RowMenu label="Section" onMove={onMove} onRemove={onRemove} />
    </div>
  );
}

const UNIT_GROUPS: [string, readonly UnitCode[]][] = [
  ["Volume", VOLUME_UNITS],
  ["Weight", WEIGHT_UNITS],
  ["Other", PACKAGE_UNITS],
];

function IngredientRow({
  item,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  item: IngredientItem;
  errors: Record<string, string>;
  onChange: (patch: Partial<IngredientItem>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const qtyError = errors[`${item.key}.quantity`];
  const nameError = errors[`${item.key}.name`];
  const label = item.name.trim() || "Ingredient";
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-2">
      <div className="flex gap-2">
        <Input
          aria-label={`${label} amount`}
          placeholder="1 1/2"
          value={item.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          className="w-20 shrink-0"
          aria-invalid={!!qtyError || undefined}
        />
        <select
          aria-label={`${label} unit`}
          value={item.unit}
          onChange={(e) => onChange({ unit: e.target.value as UnitCode | "" })}
          className="h-11 w-24 shrink-0 rounded-lg border border-input bg-transparent px-2 text-base dark:bg-input/30"
        >
          <option value="">—</option>
          {UNIT_GROUPS.map(([group, units]) => (
            <optgroup key={group} label={group}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Input
          aria-label="Ingredient name"
          placeholder="garlic"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={!!nameError || undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`${label} prep note`}
          placeholder="Prep note, e.g. minced"
          value={item.prepNote}
          onChange={(e) => onChange({ prepNote: e.target.value })}
        />
        {item.isOptional ? <Badge variant="secondary">optional</Badge> : null}
        <RowMenu
          label={label}
          onMove={onMove}
          onRemove={onRemove}
          extra={
            <DropdownMenuItem onSelect={() => onChange({ isOptional: !item.isOptional })}>
              {item.isOptional ? "Mark as needed" : "Mark as optional"}
            </DropdownMenuItem>
          }
        />
      </div>
      <FieldError message={qtyError ?? nameError} />
    </div>
  );
}

function TagsInput({
  tags,
  onChange,
  suggestions,
  error,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  error?: string;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const full = tags.length >= MAX_TAGS;

  function add(raw: string) {
    const next = uniqueTags([...tags, ...raw.split(",")]).slice(0, MAX_TAGS);
    onChange(next);
    setText("");
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="tags-heading">
      <h2 id="tags-heading" className="text-lg font-semibold">
        Tags <span className="text-sm font-normal text-muted-foreground">up to {MAX_TAGS}</span>
      </h2>
      {tags.length ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.toLowerCase()}>
              <Badge variant="secondary" className="h-9 gap-1 pr-1 text-sm">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="flex size-7 items-center justify-center rounded-full hover:bg-foreground/10"
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label="Add a tag"
          placeholder={full ? "Tag limit reached" : "Dinner, Chicken, Quick…"}
          list={listId}
          value={text}
          disabled={full}
          maxLength={40}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            }
          }}
        />
        <Button type="button" variant="outline" disabled={full || !text.trim()} onClick={() => add(text)}>
          Add
        </Button>
      </div>
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      <p className={cn("text-sm text-destructive", !error && "hidden")}>{error}</p>
    </section>
  );
}
