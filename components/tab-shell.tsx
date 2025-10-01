"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/strategy", label: "Strategy Lab" },
  { href: "/explore", label: "Explore Data" },
];

export function TabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-wide text-white/90">AI Backtester</h1>
          <nav aria-label="Primary" className="flex items-center gap-2 text-sm font-medium">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={clsx(
                    "rounded-full px-4 py-2 transition-colors",
                    active
                      ? "bg-blue-600 text-white shadow"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
