"use client";

import { createRealtimeClient } from "@neon/realtime/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { useState, type ReactNode } from "react";

// One Realtime client per mounted app, created inside the tree so the server
// render never connects. Without a URL (Realtime not configured) the app still
// renders; screens fall back to polling.
export function RealtimeRoot({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_NEON_REALTIME_URL;
  const [client] = useState(() => (url ? createRealtimeClient({ url }) : null));
  if (!client) return <>{children}</>;
  return <RealtimeProvider client={client}>{children}</RealtimeProvider>;
}
