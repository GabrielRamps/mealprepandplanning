"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * "Oct 12" in the phone's time zone ("Oct 12, 2025" for other years). The
 * server has no time zone to go by, so it renders the UTC date and the phone
 * swaps in its own right after hydration.
 */
export function LocalDate({ iso }: { iso: string }) {
  const onPhone = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const zone = onPhone ? undefined : "UTC";
  const thisYear = new Date().getFullYear() === date.getFullYear();
  const text = date.toLocaleDateString(onPhone ? undefined : "en-US", {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
    timeZone: zone,
  });
  return <time dateTime={iso}>{text}</time>;
}
