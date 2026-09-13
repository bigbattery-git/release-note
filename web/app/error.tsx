"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-red-600">ERROR</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Release 정보를 불러오지 못했습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          잠시 후 다시 시도해 주세요.
        </p>
        <button type="button" onClick={reset} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          다시 시도
        </button>
      </div>
    </main>
  );
}
