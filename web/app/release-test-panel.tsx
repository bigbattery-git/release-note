"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CollectionApiResponse } from "../lib/releases/types";

export function ReleaseTestPanel() {
  const router = useRouter();
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

      if (data.success) {
        router.refresh();
      }
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
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            RELEASE COLLECTOR
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            기술 Release 확인
          </h1>
          <p className="mt-2 leading-7 text-slate-600">
            활성 technology의 최신 안정 Release를 확인해 저장합니다.
          </p>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={collectReleases}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isRunning ? "Release 확인 중…" : "최신 Release 확인"}
        </button>
      </div>

      {isRunning ? (
        <p className="mt-4 text-sm text-slate-500" role="status">
          활성 technology의 Release를 확인하고 있습니다.
        </p>
      ) : null}

      {result?.success ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className="text-sm font-medium text-emerald-700">
            최신 Release 확인을 완료했습니다.
          </p>
          {result.warnings.length > 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              일부 Release의 요약을 생성하지 못했습니다. 다음 확인에서 다시
              시도합니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {result && !result.success ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {result.error}
        </p>
      ) : null}
    </section>
  );
}
