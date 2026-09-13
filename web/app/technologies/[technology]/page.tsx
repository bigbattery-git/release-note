import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTechnologyReleasePage,
  parseReleasePage,
} from "../../../lib/releases/history.ts";

export const dynamic = "force-dynamic";

interface ITechnologyPageProps {
  params: Promise<{ technology: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function TechnologyPage({
  params,
  searchParams,
}: ITechnologyPageProps) {
  const [{ technology }, query] = await Promise.all([params, searchParams]);
  const page = parseReleasePage(query.page);

  if (page === null) {
    notFound();
  }

  const releasePage = await getTechnologyReleasePage(technology, page);

  if (!releasePage) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          ← 최신 Release로 돌아가기
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            RELEASE HISTORY
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {releasePage.displayName}
          </h1>
          <p className="mt-2 text-slate-600">
            저장된 Release를 최근 저장 순서로 보여줍니다.
          </p>
        </header>

        {releasePage.items.length > 0 ? (
          <ul className="mt-8 space-y-3">
            {releasePage.items.map((release) => (
              <li key={release.id}>
                <Link
                  href={`/releases/${release.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{release.version}</p>
                      <h2 className="mt-1 text-sm leading-6 text-slate-700">
                        {release.title}
                      </h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {release.hasSummary ? "요약 있음" : "요약 없음"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <time dateTime={release.releasedAt}>
                      발행 {release.releasedAt.slice(0, 10)}
                    </time>
                    <time dateTime={release.createdAt}>
                      저장 {release.createdAt.slice(0, 10)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            저장된 Release가 없습니다.
          </p>
        )}

        <nav aria-label="Release 목록 페이지" className="mt-8 flex items-center justify-between">
          {releasePage.page > 1 ? (
            <Link
              href={`/technologies/${encodeURIComponent(releasePage.technology)}?page=${releasePage.page - 1}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
            >
              ← 이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-500">{releasePage.page} page</span>
          {releasePage.hasNext ? (
            <Link
              href={`/technologies/${encodeURIComponent(releasePage.technology)}?page=${releasePage.page + 1}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
            >
              다음 →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}
