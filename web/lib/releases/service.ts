import { sql, type Transaction } from "kysely";
import { getDatabase, type IDatabase } from "../database.ts";
import {
  fetchLatestStableRelease,
  type IGitHubTarget,
} from "./github.ts";
import type { ICollectedRelease, ICollectionResult } from "./types";
import {
  hasReleaseChanged,
  hasReleaseDescriptionChanged,
} from "./release-comparison.ts";
import { summarizeReleaseDescription } from "./summary.ts";

export interface ISavedRelease {
  description: string | null;
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
 * 같은 external_id가 없으면 새 행을 저장하고, 있으면 변경된 내용만 갱신한다.
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
      summary: null,
    };
  }

  if (!hasReleaseChanged(existing, release)) {
    return {
      description: existing.description,
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
    summary: descriptionChanged ? null : existing.summary,
  };
}

export async function createSummaryWarning(
  release: ICollectedRelease,
  saved: ISavedRelease,
  dependencies: ISummaryDependencies = summaryDependencies,
): Promise<string | null> {
  if (saved.summary) {
    return null;
  }

  if (!saved.description?.trim()) {
    return null;
  }

  try {
    const summary = await dependencies.summarize(saved.description);
    await dependencies.persistSummary(release, summary);

    return null;
  } catch {
    return `${release.label} Release 요약 생성에 실패했습니다.`;
  }
}

/**
 * 활성 technology의 최신 Release를 저장하고 요약 실패 경고만 반환한다.
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

  const warnings: string[] = [];

  for (const { release, saved } of savedReleases) {
    const warning = await createSummaryWarning(release, saved);

    if (warning) {
      warnings.push(warning);
    }
  }

  return {
    warnings,
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
