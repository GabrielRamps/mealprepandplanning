"use client";

import { Camera, ChevronDown, ImagePlus, Link2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  retryImportAction,
  startLinkImportAction,
  startPhotoImportAction,
  startTextImportAction,
  type StartImportResult,
} from "@/app/(app)/import/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resizeImage } from "@/lib/resize-image";

const MAX_PHOTOS = 6;

/** C1, C2 and pasted text; each opens the review screen while it processes. */
export function ImportForms() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  function go(start: () => Promise<StartImportResult>) {
    setError(null);
    startTransition(async () => {
      const result = await start();
      if (result.jobId) router.push(`/import/${result.jobId}`);
      else setError(result.error ?? "Couldn't start the import. Try again.");
    });
  }

  function onPhotos(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.length > MAX_PHOTOS) {
      setError(`Pick up to ${MAX_PHOTOS} photos for one recipe.`);
      return;
    }
    go(async () => {
      const fd = new FormData();
      // Shrunk on the phone first (PRD 3) so the upload stays small.
      for (const file of await Promise.all(files.map((f) => resizeImage(f)))) fd.append("images", file);
      return startPhotoImportAction(fd);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) go(() => startLinkImportAction(link));
        }}
      >
        <Label htmlFor="import-link">Paste a link</Label>
        <div className="flex gap-2">
          <Input
            id="import-link"
            type="url"
            inputMode="url"
            placeholder="Instagram, TikTok or recipe website"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Button type="submit" disabled={pending || !link.trim()}>
            <Link2 aria-hidden /> Import
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-1.5" id="photos">
        <span className="text-sm font-medium">Or add photos</span>
        <p className="text-sm text-muted-foreground">
          Screenshots, a recipe card or cookbook pages. Up to {MAX_PHOTOS} photos make one recipe.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => camera.current?.click()}>
            <Camera aria-hidden /> Take photo
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => library.current?.click()}>
            <ImagePlus aria-hidden /> Choose photos
          </Button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" onChange={(e) => onPhotos(e.target.files)} />
        <input ref={library} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => onPhotos(e.target.files)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <button type="button" className="flex min-h-11 items-center gap-1 text-left text-sm font-medium" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          Or paste recipe text <ChevronDown className={showText ? "size-4 rotate-180" : "size-4"} aria-hidden />
        </button>
        {showText ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) go(() => startTextImportAction(text));
            }}
          >
            <Textarea aria-label="Recipe text" rows={6} maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ingredients and steps…" />
            <Button type="submit" variant="outline" disabled={pending || !text.trim()}>
              Import text
            </Button>
          </form>
        ) : null}
      </div>

      {pending ? <p className="text-sm text-muted-foreground">Starting import…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RetryButton({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await retryImportAction(jobId);
            if (result.error) setError(result.error);
            else router.push(`/import/${jobId}`);
          })
        }
      >
        <RotateCcw aria-hidden /> Retry
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
