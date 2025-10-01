import type { ReactNode } from "react";

import { StrategyStateProvider } from "@/components/strategy-state-context";
import { TabShell } from "@/components/tab-shell";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <StrategyStateProvider>
      <TabShell>{children}</TabShell>
    </StrategyStateProvider>
  );
}
