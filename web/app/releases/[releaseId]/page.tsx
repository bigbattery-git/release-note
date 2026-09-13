import Link from "next/link";
import { notFound } from "next/navigation";
import { getReleaseDetail } from "../../../lib/releases/history.ts";

export const dynamic = "force-dynamic";

interface IReleasePageProps {
  params: Promise<{ releaseId: string }>;
}

export default async function ReleasePage({ params }: IReleasePageProps) {
  const { releaseId } = await params;
  const release = await getReleaseDetail(releaseId);

  if (!release) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <article className="mx-auto w-full max-w-3xl">
        <Link
          href={`/technologies/${encodeURIComponent(release.technology)}`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          ← {release.displayName} Release 목록
        </Link>

        <header className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            {release.displayName}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {release.version}
          </h1>
          <p className="mt-3 text-lg leading-7 text-slate-700">{release.title}</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
            <time dateTime={release.releasedAt}>
              발행 {release.releasedAt.slice(0, 10)}
            </time>
            <time dateTime={release.createdAt}>
              저장 {release.createdAt.slice(0, 10)}
            </time>
            {release.sourceUrl ? (
              <a
                href={release.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 hover:text-blue-900"
              >
                공식 Release ↗
              </a>
            ) : null}
          </div>
        </header>

        <section
          aria-labelledby="release-summary-heading"
          className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="release-summary-heading" className="text-xl font-bold text-slate-950">
            Release 요약
          </h2>
          {release.summary?.trim() ? (
            <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
              {release.summary}
            </p>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
              저장된 요약이 없습니다. 원문이 없거나 아직 요약이 생성되지 않았습니다.
            </p>
          )}
        </section>
      </article>
    </main>
  );
}
