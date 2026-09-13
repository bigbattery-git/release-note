import { z } from "zod";
import type { ICollectedRelease } from "./types";

/**
 * github Release API 응답 형식
 */
const githubReleaseSchema = z.object({
  id: z.number().int().nonnegative(),
  tag_name: z.string().min(1),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  html_url: z.string().url(),
});

/**
 * github Release API 응답 형식을 배열로 감싸서 검증
 */
const githubReleaseListSchema = z.array(githubReleaseSchema);

type GitHubRelease = z.infer<typeof githubReleaseSchema>;

export interface IGitHubTarget {
  technology: string;
  label: string;
  releasesPath: string;
}

/**
 * Github release 조회 중 발생한 오류를 나타내는 커스텀 에러 클래스
 * Error을 상속받아서 name, message, stack을 포함함
 */
export class GitHubReleaseError extends Error {
  readonly technology: string;
  readonly publicMessage: string;

  constructor(
    technology: string,
    publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "GitHubReleaseError";
    this.technology = technology;
    this.publicMessage = publicMessage;
  }
}

/**
 * github Release API 응답 형식 검사
 * 내부적으로 사용할 함수라서 safeParse 대신 parse 사용
 * @param value 
 * @returns 값이 올바르면 value 그대로 반환. 값이 올바르지 않으면 zod 에러를 반환
 */
export function parseGitHubReleases(value: unknown): GitHubRelease[] {
  return githubReleaseListSchema.parse(value);
}

/**
 * 최신 release만을 반환. 
 * @param releases 
 * @returns 
 */
export function selectLatestStableRelease(
  releases: GitHubRelease[],
): GitHubRelease | null {
  return (
    releases
      .filter(
        (release) =>
          !release.draft &&
          !release.prerelease &&
          release.published_at !== null,
      )
      .sort(
        (left, right) =>
          Date.parse(right.published_at ?? "") -
          Date.parse(left.published_at ?? ""),
      )[0] ?? null
  );
}

/**
 * mariaDB DATETIME 형식으로 변환
 * @param isoDate 
 * @returns 
 */
export function toMariaDbDateTime(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Release 발행일 형식이 올바르지 않습니다.");
  }

  return date.toISOString().slice(0, 23).replace("T", " ");
}

/**
 * api 호출 시 사용하는 URL을 합치기 위함.
 * @param baseUrl 
 * @param path 
 * @returns 
 */
function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * 지정된 github 타겟의 최신 release를 조회하여 반환.
 * @param target 
 * @returns 
 */
export async function fetchLatestStableRelease(
  target: IGitHubTarget,
): Promise<ICollectedRelease> {
  const baseUrl = process.env.GITHUB_API_BASE_URL ?? "https://api.github.com";
  const url = new URL(joinUrl(baseUrl, target.releasesPath));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", "1");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": process.env.GITHUB_USER_AGENT ?? "news-summery/1.0",
    "X-GitHub-Api-Version":
      process.env.GITHUB_API_VERSION ?? "2026-03-10",
  };
  const token = process.env.GITHUB_TOKEN?.trim();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GitHubReleaseError(
      target.technology,
      `${target.label} Release API에 연결할 수 없습니다.`,
    );
  }

  if (!response.ok) {
    const rateLimited = response.status === 403 || response.status === 429;
    throw new GitHubReleaseError(
      target.technology,
      rateLimited
        ? `${target.label} GitHub API 요청 한도를 확인해 주세요.`
        : `${target.label} Release 조회에 실패했습니다.`,
    );
  }

  let releases: GitHubRelease[];

  try {
    releases = parseGitHubReleases(await response.json());
  } catch {
    throw new GitHubReleaseError(
      target.technology,
      `${target.label} Release 응답 형식이 올바르지 않습니다.`,
    );
  }

  const latest = selectLatestStableRelease(releases);

  if (!latest?.published_at) {
    throw new GitHubReleaseError(
      target.technology,
      `${target.label}의 안정 Release를 찾을 수 없습니다.`,
    );
  }

  return {
    technology: target.technology,
    label: target.label,
    externalId: String(latest.id),
    version: latest.tag_name,
    title: latest.name?.trim() || latest.tag_name,
    description: latest.body,
    sourceUrl: latest.html_url,
    changelogUrl: null,
    releasedAt: toMariaDbDateTime(latest.published_at),
  };
}
