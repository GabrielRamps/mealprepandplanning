import type { ReactNode } from "react";
import { TabBar } from "@/components/tab-bar";

// Screens behind the bottom tab bar. Each page checks the session and household
// itself (requireHousehold), since a layout doesn't re-run on navigation.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      {children}
      <TabBar />
    </div>
  );
}
