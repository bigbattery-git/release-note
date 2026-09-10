"use client";

import { useState } from "react";
import type {
  CollectionApiResponse,
  ICollectionItemResult,
} from "../lib/releases/types";

const statusLabels = {
  inserted: "신규 저장",
  updated: "정보 갱신",
  skipped: "변경 없음",
} as const;

function ResultItem({ item }: { item: ICollectionItemResult }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="font-semibold text-slate-900">
          {item.label}
        </p>
        <p className="text-sm text-slate-500">{item.version}</p>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        {statusLabels[item.status]}
      </span>
    </li>
  );
}

export function ReleaseTestPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CollectionApiResponse | null>(null);

  async function collectReleases() {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/releases/collect", { method: "POST" });
      const data = (await response.json()) as CollectionApiResponse;
      setResult(data);
    } catch {
      setResult({
        success: false,
        error: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur sm:p-8">
      <div className="mb-7">
        <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">
          RELEASE COLLECTOR
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          최신 기술 Release 저장
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Next.js, Node.js, React의 최신 안정 Release를 GitHub에서 확인해
          MariaDB에 저장합니다.
        </p>
      </div>

      <button
        type="button"
        disabled={isRunning}
        onClick={collectReleases}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isRunning ? "최신 Release 확인 중…" : "최신 Release 저장 테스트"}
      </button>

      {isRunning ? (
        <p className="mt-4 text-center text-sm text-slate-500" role="status">
          세 프로젝트의 Release를 순서대로 확인하고 있습니다.
        </p>
      ) : null}

      {result?.success ? (
        <div className="mt-7" aria-live="polite">
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-2xl font-bold text-blue-700">{result.inserted}</p>
              <p className="text-xs text-blue-900">신규 저장</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-2xl font-bold text-amber-700">{result.updated}</p>
              <p className="text-xs text-amber-900">정보 갱신</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-2xl font-bold text-slate-700">{result.skipped}</p>
              <p className="text-xs text-slate-700">변경 없음</p>
            </div>
          </div>
          <ul className="space-y-3">
            {result.items.map((item) => (
              <ResultItem key={item.technology} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {result && !result.success ? (
        <p
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {result.error}
        </p>
      ) : null}
    </section>
  );
}
