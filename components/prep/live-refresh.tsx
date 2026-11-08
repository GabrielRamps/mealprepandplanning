"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveSignal } from "@/components/live-signal";

// Prep screens reload when the other phone changes something: Realtime when
// it's live, otherwise every 15 s while on screen (PRD-prep 9).
const REFRESH_MS = 15_000;

type Signal = { body: Record<string, string> };

/**
 * Keeps a server-rendered screen in step with the other phone. While one of
 * our own saves is in flight a reload would show the screen before the save,
 * so it waits until the save is done.
 */
export function LiveRefresh({ signals, saving }: { signals: Signal[]; saving: boolean }) {
  const router = useRouter();
  const [live, setLive] = useState<Record<number, boolean>>({});
  const deferred = useRef(false);
  const savingNow = useRef(saving);
  const allLive = signals.length > 0 && signals.every((_, i) => live[i]);

  const onChange = useCallback(() => {
    if (savingNow.current) deferred.current = true;
    else router.refresh();
  }, [router]);

  useEffect(() => {
    savingNow.current = saving;
    if (saving || !deferred.current) return;
    deferred.current = false;
    router.refresh();
  }, [saving, router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !savingNow.current) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = allLive
      ? null
      : setInterval(() => {
          if (document.visibilityState === "visible" && !savingNow.current) router.refresh();
        }, REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, [allLive, router]);

  return (
    <>
      {signals.map((s, i) => (
        <SignalSlot key={JSON.stringify(s.body)} index={i} body={s.body} onChange={onChange} setLive={setLive} />
      ))}
    </>
  );
}

function SignalSlot({
  index,
  body,
  onChange,
  setLive,
}: {
  index: number;
  body: Record<string, string>;
  onChange: () => void;
  setLive: (fn: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
}) {
  const onLive = useCallback((v: boolean) => setLive((prev) => (prev[index] === v ? prev : { ...prev, [index]: v })), [index, setLive]);
  return <LiveSignal sealUrl="/api/realtime/prep" body={body} onChange={onChange} onLive={onLive} />;
}
