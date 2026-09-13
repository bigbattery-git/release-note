import { sql, type Transaction } from "kysely";
import { getDatabase, type IDatabase } from "../database.ts";
import {
  fetchLatestStableRelease,
  type IGitHubTarget,
} from "./github.ts";
import type {
  CollectionStatus,
  ICollectedRelease,
  ICollectionItemResult,
  ICollectionResult,
} from "./types";
import {
  hasReleaseChanged,
  hasReleaseDescriptionChanged,
} from "./release-comparison.ts";
import { summarizeReleaseDescription } from "./summary.ts";

export interface ISavedRelease {
  description: string | null;
  status: CollectionStatus;
  summary: string | null;
}

export interface ISummaryDependencies {
  persistSummary: (
    release: ICollectedRelease,
    summary: string,
  ) => Promise<void>;
  summarize: (description: string) => Promise<string>;
}

const summaryDependencies: ISummaryDependencies = {
  async persistSummary(release, summary) {
    const database = getDatabase();

    await database
      .updateTable("technology_releases")
      .set({
        summary,
        updated_at: sql<string>`CURRENT_TIMESTAMP(3)`,
      })
      .where("technology", "=", release.technology)
      .where("external_id", "=", release.externalId)
      .where("summary", "is", null)
      .executeTakeFirstOrThrow();
  },
  summarize: summarizeReleaseDescription,
};

/**
 * 최신 릴리즈 저장을 시도한다.
 * 릴리즈가 없으면, 최신 릴리즈를 저장하고 종료
 * 릴리즈가 있으면, api로 받아온 릴리즈와 db에 저장된 릴리즈를 비교하여 같으면 skipped를 반환.
 * 다르면 db의 technology, external_id를 기준으로 릴리즈를 업데이트하고 updated를 반환.
 * @param transaction - 데이터베이스 트랜잭션
 * @param release - 수집된 Release 정보
 * @returns 저장 결과
 */
async function saveRelease(
  transaction: Transaction<IDatabase>,
  release: ICollectedRelease,
): Promise<ISavedRelease> {
  const existing = await transaction
    .selectFrom("technology_releases")
    .select([
      "version",
      "title",
      "description",
      "summary",
      "source_url",
      "changelog_url",
      "released_at",
    ])
    .where("technology", "=", release.technology)
    .where("external_id", "=", release.externalId)
    .executeTakeFirst();

  if (!existing) {
    await transaction
      .insertInto("technology_releases")
      .values({
        technology: release.technology,
        external_id: release.externalId,
        version: release.version,
        title: release.title,
        description: release.description,
        source_url: release.sourceUrl,
        changelog_url: release.changelogUrl,
        released_at: release.releasedAt,
      })
      .executeTakeFirstOrThrow();

    return {
      description: release.description,
      status: "inserted",
      summary: null,
    };
  }

  if (!hasReleaseChanged(existing, release)) {
    return {
      description: existing.description,
      status: "skipped",
      summary: existing.summary,
    };
  }

  const descriptionChanged = hasReleaseDescriptionChanged(
    existing.description,
    release.description,
  );

  await transaction
    .updateTable("technology_releases")
    .set({
      version: release.version,
      title: release.title,
      description: release.description,
      summary: descriptionChanged ? null : existing.summary,
      source_url: release.sourceUrl,
      changelog_url: release.changelogUrl,
      released_at: release.releasedAt,
      updated_at: sql<string>`CURRENT_TIMESTAMP(3)`,
    })
    .where("technology", "=", release.technology)
    .where("external_id", "=", release.externalId)
    .executeTakeFirstOrThrow();

  return {
    description: release.description,
    status: "updated",
    summary: descriptionChanged ? null : existing.summary,
  };
}

export async function createSummaryResult(
  release: ICollectedRelease,
  saved: ISavedRelease,
  dependencies: ISummaryDependencies = summaryDependencies,
): Promise<ICollectionItemResult> {
  if (saved.summary) {
    return {
      technology: release.technology,
      label: release.label,
      version: release.version,
      status: saved.status,
      summary: saved.summary,
      summaryStatus: "preserved",
    };
  }

  if (!saved.description?.trim()) {
    return {
      technology: release.technology,
      label: release.label,
      version: release.version,
      status: saved.status,
      summary: null,
      summaryStatus: "not_applicable",
    };
  }

  try {
    const summary = await dependencies.summarize(saved.description);
    await dependencies.persistSummary(release, summary);

    return {
      technology: release.technology,
      label: release.label,
      version: release.version,
      status: saved.status,
      summary,
      summaryStatus: "generated",
    };
  } catch {
    return {
      technology: release.technology,
      label: release.label,
      version: release.version,
      status: saved.status,
      summary: null,
      summaryStatus: "failed",
      summaryError: `${release.label} Release 요약 생성에 실패했습니다.`,
    };
  }
}

/**
 * default_technologies 테이블의 enabled가 1인 기술을 조회한 뒤, 
 * 각 기술별 inserted, updated, skipped 여부를 숫자로 반환
 * @returns 
 */
async function executeCollection(): Promise<ICollectionResult> {
  const database = getDatabase();
  const technologyRows = await database
    .selectFrom("default_technologies")
    .select(["technology", "display_name", "releases_path"])
    .where("enabled", "=", 1)
    .orderBy("sort_order")
    .execute();
  const targets: IGitHubTarget[] = technologyRows.map((technology) => ({
    technology: technology.technology,
    label: technology.display_name,
    releasesPath: technology.releases_path,
  }));

  if (targets.length === 0) {
    throw new Error("수집할 기본 technology가 없습니다.");
  }

  const releases: ICollectedRelease[] = [];

  for (const target of targets) {
    releases.push(await fetchLatestStableRelease(target));
  }

  // 여기서 saveRelease를 호출하여 릴리즈 저장, 스킵, 변경 여부를 판단하고 결과를 반환
  const savedReleases = await database.transaction().execute(async (transaction) => {
    const results: Array<{
      release: ICollectedRelease;
      saved: ISavedRelease;
    }> = [];

    for (const release of releases) {
      results.push({
        release,
        saved: await saveRelease(transaction, release),
      });
    }

    return results;
  });

  const items: ICollectionItemResult[] = [];

  for (const { release, saved } of savedReleases) {
    items.push(await createSummaryResult(release, saved));
  }

  return {
    items,
    inserted: items.filter((item) => item.status === "inserted").length,
    updated: items.filter((item) => item.status === "updated").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    summaryFailed: items.filter((item) => item.summaryStatus === "failed").length,
  };
}

let activeCollection: Promise<ICollectionResult> | null = null;

/**
 * executeCollection를 호출하여 결과값을 반환함.
 * @returns 
 */
export function collectLatestReleases(): Promise<ICollectionResult> {
  if (!activeCollection) {
    activeCollection = executeCollection().finally(() => {
      activeCollection = null;
    });
  }

  return activeCollection;
}
