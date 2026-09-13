import { sql } from "kysely";
import { getDatabase } from "../database.ts";

export const RELEASES_PER_PAGE = 20;
const RECENT_RELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface IReleaseListItem {
  id: string;
  version: string;
  title: string;
  releasedAt: string;
  createdAt: string;
  hasSummary: boolean;
}

export interface ILatestTechnologyRelease {
  technology: string;
  displayName: string;
  release: (IReleaseListItem & { isRecent: boolean }) | null;
}

export interface ITechnologyReleasePage {
  technology: string;
  displayName: string;
  items: IReleaseListItem[];
  page: number;
  hasNext: boolean;
}

export interface IReleaseDetail extends IReleaseListItem {
  technology: string;
  displayName: string;
  summary: string | null;
  sourceUrl: string | null;
}

function parseDatabaseDateTime(value: string): number {
  const isoValue = value.includes("T") ? value : value.replace(" ", "T");
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(isoValue);

  return Date.parse(includesTimeZone ? isoValue : `${isoValue}Z`);
}

/** DB의 동일 timezone 기준 시각 두 개로 최근 7일 여부를 판정한다. */
export function isReleaseRecent(
  createdAt: string,
  databaseNow: string,
): boolean {
  const createdAtTime = parseDatabaseDateTime(createdAt);
  const currentTime = parseDatabaseDateTime(databaseNow);

  if (Number.isNaN(createdAtTime) || Number.isNaN(currentTime)) {
    return false;
  }

  const age = currentTime - createdAtTime;
  return age >= 0 && age <= RECENT_RELEASE_WINDOW_MS;
}

/** 양의 정수 page만 허용한다. */
export function parseReleasePage(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    return value === undefined ? 1 : null;
  }

  const page = Number(value);
  const offset = (page - 1) * RELEASES_PER_PAGE;

  return Number.isSafeInteger(page) && Number.isSafeInteger(offset) ? page : null;
}

/** 활성 technology별 가장 최근 저장 Release 한 건을 조회한다. */
export async function getLatestTechnologyReleases(): Promise<
  ILatestTechnologyRelease[]
> {
  const database = getDatabase();
  const technologies = await database
    .selectFrom("default_technologies")
    .select(["technology", "display_name"])
    .where("enabled", "=", 1)
    .orderBy("sort_order")
    .execute();

  return Promise.all(
    technologies.map(async (technology) => {
      const release = await database
        .selectFrom("technology_releases")
        .select([
          "id",
          "version",
          "title",
          "released_at",
          "created_at",
          "summary",
          sql<string>`CURRENT_TIMESTAMP(3)`.as("database_now"),
        ])
        .where("technology", "=", technology.technology)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst();

      return {
        technology: technology.technology,
        displayName: technology.display_name,
        release: release
          ? {
              id: release.id,
              version: release.version,
              title: release.title,
              releasedAt: release.released_at,
              createdAt: release.created_at,
              hasSummary: Boolean(release.summary?.trim()),
              isRecent: isReleaseRecent(
                release.created_at,
                release.database_now,
              ),
            }
          : null,
      };
    }),
  );
}

/** 활성 technology의 저장 Release를 offset 방식으로 조회한다. */
export async function getTechnologyReleasePage(
  technology: string,
  page: number,
): Promise<ITechnologyReleasePage | null> {
  const database = getDatabase();
  const technologyRow = await database
    .selectFrom("default_technologies")
    .select(["technology", "display_name"])
    .where("technology", "=", technology)
    .where("enabled", "=", 1)
    .executeTakeFirst();

  if (!technologyRow) {
    return null;
  }

  const rows = await database
    .selectFrom("technology_releases")
    .select([
      "id",
      "version",
      "title",
      "released_at",
      "created_at",
      "summary",
    ])
    .where("technology", "=", technology)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(RELEASES_PER_PAGE + 1)
    .offset((page - 1) * RELEASES_PER_PAGE)
    .execute();
  const hasNext = rows.length > RELEASES_PER_PAGE;

  return {
    technology: technologyRow.technology,
    displayName: technologyRow.display_name,
    items: rows.slice(0, RELEASES_PER_PAGE).map((release) => ({
      id: release.id,
      version: release.version,
      title: release.title,
      releasedAt: release.released_at,
      createdAt: release.created_at,
      hasSummary: Boolean(release.summary?.trim()),
    })),
    page,
    hasNext,
  };
}

/** DB primary key로 Release 상세를 조회한다. */
export async function getReleaseDetail(
  releaseId: string,
): Promise<IReleaseDetail | null> {
  if (!/^[1-9]\d*$/u.test(releaseId)) {
    return null;
  }

  const release = await getDatabase()
    .selectFrom("technology_releases as release")
    .innerJoin(
      "default_technologies as technology",
      "technology.technology",
      "release.technology",
    )
    .select([
      "release.id",
      "release.technology",
      "technology.display_name",
      "release.version",
      "release.title",
      "release.released_at",
      "release.created_at",
      "release.summary",
      "release.source_url",
    ])
    .where("release.id", "=", releaseId)
    .where("technology.enabled", "=", 1)
    .executeTakeFirst();

  return release
    ? {
        id: release.id,
        technology: release.technology,
        displayName: release.display_name,
        version: release.version,
        title: release.title,
        releasedAt: release.released_at,
        createdAt: release.created_at,
        hasSummary: Boolean(release.summary?.trim()),
        summary: release.summary,
        sourceUrl: release.source_url,
      }
    : null;
}
