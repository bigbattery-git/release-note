"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QueryStatusPanel } from "../../../components/query-status-panel";
import {
  fetchTechnologyReleasePage,
  RELEASE_QUERY_TIMING,
  ReleaseQueryError,
  releaseQueryKeys,
  retryReleaseQuery,
} from "../../../lib/releases/client";

interface TechnologyReleaseListProps {
  technology: string;
}

export function TechnologyReleaseList({
  technology,
}: TechnologyReleaseListProps) {
  const searchParams = useSearchParams();
  const pageValues = searchParams.getAll("page");
  const normalizedPageValues = pageValues.length === 0 ? ["1"] : pageValues;
  const { data, error, isPending, isPlaceholderData, refetch } = useQuery({
    queryKey: releaseQueryKeys.technology(technology, normalizedPageValues),
    queryFn: () =>
      fetchTechnologyReleasePage(technology, normalizedPageValues),
    placeholderData: keepPreviousData,
    retry: retryReleaseQuery,
    ...RELEASE_QUERY_TIMING,
  });

  if (isPending) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto w-full max-w-3xl">
          <QueryStatusPanel
            title="Release 이력을 불러오고 있습니다."
            description="잠시만 기다려 주세요."
          />
        </div>
      </main>
    );
  }

  if (error) {
    const isNotFound =
      error instanceof ReleaseQueryError && error.status === 404;
    const isInvalidPage =
      error instanceof ReleaseQueryError && error.status === 400;

    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Link
            href="/"
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            ← 최신 Release로 돌아가기
          </Link>
          <QueryStatusPanel
            title={
              isNotFound
                ? "technology를 찾을 수 없습니다."
                : isInvalidPage
                  ? "페이지 주소가 올바르지 않습니다."
                  : "Release 이력을 불러오지 못했습니다."
            }
            description={error.message}
            actionLabel={isNotFound || isInvalidPage ? undefined : "다시 시도"}
            onAction={
              isNotFound || isInvalidPage ? undefined : () => void refetch()
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          ← 최신 Release로 돌아가기
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            RELEASE HISTORY
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {data.displayName}
          </h1>
          <p className="mt-2 text-slate-600">
            저장된 Release를 최근 저장 순서로 보여줍니다.
          </p>
          {isPlaceholderData ? (
            <p role="status" className="mt-2 text-sm font-medium text-blue-700">
              요청한 페이지로 이동하고 있습니다.
            </p>
          ) : null}
        </header>

        {data.items.length > 0 ? (
          <ul className="mt-8 space-y-3" aria-busy={isPlaceholderData}>
            {data.items.map((release) => (
              <li key={release.id}>
                <Link
                  href={`/releases/${release.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">
                        {release.version}
                      </p>
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

        <nav
          aria-label="Release 목록 페이지"
          aria-busy={isPlaceholderData}
          className="mt-8 flex items-center justify-between"
        >
          {data.page > 1 ? (
            <Link
              href={`/technologies/${encodeURIComponent(data.technology)}?page=${data.page - 1}`}
              aria-disabled={isPlaceholderData}
              tabIndex={isPlaceholderData ? -1 : undefined}
              className={`rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 ${isPlaceholderData ? "pointer-events-none opacity-50" : ""}`}
            >
              ← 이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-500">{data.page} page</span>
          {data.hasNext ? (
            <Link
              href={`/technologies/${encodeURIComponent(data.technology)}?page=${data.page + 1}`}
              aria-disabled={isPlaceholderData}
              tabIndex={isPlaceholderData ? -1 : undefined}
              className={`rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 ${isPlaceholderData ? "pointer-events-none opacity-50" : ""}`}
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
