import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Shown on the right, e.g. an icon button. */
  action?: ReactNode;
  /** Adds a back link; the title then sits on its own row below it. */
  back?: { href: string; label: string };
};

export function PageHeader({ title, action, back }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center px-2">
        {back ? (
          <Link href={back.href} className="flex min-h-11 items-center rounded-lg pr-2 text-base text-primary">
            <ChevronLeft className="size-6" aria-hidden />
            {back.label}
          </Link>
        ) : (
          <h1 className="px-2 text-xl font-semibold">{title}</h1>
        )}
        <div className="ml-auto flex items-center">{action}</div>
      </div>
      {back ? <h1 className="mx-auto max-w-2xl px-4 pb-3 text-2xl font-semibold">{title}</h1> : null}
    </header>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
