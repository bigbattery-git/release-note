"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { QueryStatusPanel } from "../components/query-status-panel";
import {
  fetchLatestTechnologyReleases,
  RELEASE_QUERY_TIMING,
  releaseQueryKeys,
  retryReleaseQuery,
} from "../lib/releases/client";

export function LatestReleaseList() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: releaseQueryKeys.latest,
    queryFn: () => fetchLatestTechnologyReleases(),
    retry: retryReleaseQuery,
    ...RELEASE_QUERY_TIMING,
  });

  if (isPending) {
    return (
      <QueryStatusPanel
        title="최신 Release를 불러오고 있습니다."
        description="잠시만 기다려 주세요."
      />
    );
  }

  if (error) {
    return (
      <QueryStatusPanel
        title="최신 Release를 불러오지 못했습니다."
        description={error.message}
        actionLabel="다시 시도"
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {data.map((technology) =>
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
  );
}
