import Link from "next/link";
import { getLatestTechnologyReleases } from "../lib/releases/history.ts";
import { ReleaseTestPanel } from "./release-test-panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const technologies = await getLatestTechnologyReleases();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <ReleaseTestPanel />

        <section aria-labelledby="latest-release-heading">
          <div className="mb-5">
            <p className="text-sm font-semibold tracking-wide text-blue-600">
              LATEST RELEASES
            </p>
            <h2
              id="latest-release-heading"
              className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
            >
              Technology별 최신 Release
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {technologies.map((technology) =>
              technology.release ? (
                <Link
                  key={technology.technology}
                  href={`/technologies/${encodeURIComponent(technology.technology)}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-slate-950 group-hover:text-blue-700">
                      {technology.displayName}
                    </h3>
                    {technology.release.isRecent ? (
                      <span
                        role="img"
                        aria-label="최근 7일 내 저장된 Release"
                        title="최근 7일 내 저장된 Release"
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-sm shadow-red-300"
                      />
                    ) : null}
                  </div>
                  <p className="mt-4 text-lg font-bold text-slate-900">
                    {technology.release.version}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                    {technology.release.title}
                  </p>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                    <time dateTime={technology.release.createdAt}>
                      저장 {technology.release.createdAt.slice(0, 10)}
                    </time>
                    <span>
                      {technology.release.hasSummary ? "요약 있음" : "요약 없음"}
                    </span>
                  </div>
                </Link>
              ) : (
                <div
                  key={technology.technology}
                  className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5"
                >
                  <h3 className="font-semibold text-slate-900">
                    {technology.displayName}
                  </h3>
                  <p className="mt-4 text-sm text-slate-500">
                    저장된 Release가 없습니다.
                  </p>
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
