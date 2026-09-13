"use client";

interface QueryStatusPanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** 목록 query의 loading과 error 상태를 일관된 형태로 표시한다. */
export function QueryStatusPanel({
  title,
  description,
  actionLabel,
  onAction,
}: QueryStatusPanelProps) {
  return (
    <div
      role={onAction ? "alert" : "status"}
      className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-100"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
