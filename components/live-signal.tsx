"use client";

import type { SealedLiveQuery } from "@neon/realtime/client";
import { useLiveQuery } from "@neon/realtime-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeAvailable } from "@/components/realtime-root";

type Props = {
  /** Route that seals the live query for the signed-in user. */
  sealUrl: string;
  body: Record<string, string>;
  /** Called on the first result and whenever the rows change. */
  onChange: () => void;
  /** Whether the subscription is live; screens poll less often while it is. */
  onLive: (live: boolean) => void;
};

/**
 * Neon Realtime as a change signal: the screen keeps loading data the way it
 * already does and reloads when the live query reports a change. Renders
 * nothing; without Realtime it reports not live and the screen keeps polling.
 */
export function LiveSignal(props: Props) {
  const available = useRealtimeAvailable();
  const { sealUrl, onLive } = props;
  const bodyJson = JSON.stringify(props.body);
  const [query, setQuery] = useState<SealedLiveQuery<unknown> | null>(null);

  const seal = useCallback(async (): Promise<SealedLiveQuery<unknown>> => {
    const res = await fetch(sealUrl, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson });
    if (!res.ok) throw new Error(`Realtime seal failed: ${res.status}`);
    return res.json();
  }, [sealUrl, bodyJson]);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    seal().then(
      (q) => !cancelled && setQuery(q),
      () => !cancelled && onLive(false),
    );
    return () => {
      cancelled = true;
      setQuery(null);
    };
  }, [available, seal, onLive]);

  if (!available || !query) return null;
  return <Subscription key={query.queryFingerprint} query={query} seal={seal} onChange={props.onChange} onLive={onLive} />;
}

function Subscription({
  query,
  seal,
  onChange,
  onLive,
}: {
  query: SealedLiveQuery<unknown>;
  seal: () => Promise<SealedLiveQuery<unknown>>;
  onChange: () => void;
  onLive: (live: boolean) => void;
}) {
  const { data, status } = useLiveQuery(query, { refreshQuery: seal });
  const signature = data ? JSON.stringify(data) : null;
  const last = useRef<string | null>(null);

  useEffect(() => {
    onLive(status === "live");
  }, [status, onLive]);

  useEffect(() => () => onLive(false), [onLive]);

  useEffect(() => {
    if (signature === null || signature === last.current) return;
    // The first result counts too: a change made while connecting would
    // otherwise wait for the next poll.
    last.current = signature;
    onChange();
  }, [signature, onChange]);

  return null;
}
