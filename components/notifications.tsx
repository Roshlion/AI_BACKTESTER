"use client";

import clsx from "clsx";

interface NotificationBarProps {
  message: string;
  tone?: "info" | "warning" | "success" | "error";
  onDismiss?: () => void;
}

const toneStyles: Record<Required<NotificationBarProps>["tone"], string> = {
  info: "border-blue-500/40 bg-blue-900/30 text-blue-100",
  warning: "border-amber-500/40 bg-amber-900/30 text-amber-100",
  success: "border-emerald-500/40 bg-emerald-900/30 text-emerald-100",
  error: "border-red-500/40 bg-red-900/30 text-red-100",
};

export function NotificationBar({ message, tone = "info", onDismiss }: NotificationBarProps) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm",
        toneStyles[tone],
      )}
      role="status"
    >
      <span className="flex-1 leading-5">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded bg-black/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-white/80 transition hover:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-white/70"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
