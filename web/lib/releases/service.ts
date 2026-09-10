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
import { hasReleaseChanged } from "./release-comparison.ts";

async function saveRelease(
  transaction: Transaction<IDatabase>,
  release: ICollectedRelease,
): Promise<CollectionStatus> {
  const existing = await transaction
    .selectFrom("technology_releases")
    .select([
      "version",
      "title",
      "description",
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

    return "inserted";
  }

  if (!hasReleaseChanged(existing, release)) {
    return "skipped";
  }

  await transaction
    .updateTable("technology_releases")
    .set({
      version: release.version,
      title: release.title,
      description: release.description,
      source_url: release.sourceUrl,
      changelog_url: release.changelogUrl,
      released_at: release.releasedAt,
      updated_at: sql<string>`CURRENT_TIMESTAMP(3)`,
    })
    .where("technology", "=", release.technology)
    .where("external_id", "=", release.externalId)
    .executeTakeFirstOrThrow();

  return "updated";
}

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

  const items = await database.transaction().execute(async (transaction) => {
    const results: ICollectionItemResult[] = [];

    for (const release of releases) {
      results.push({
        technology: release.technology,
        label: release.label,
        version: release.version,
        status: await saveRelease(transaction, release),
      });
    }

    return results;
  });

  return {
    items,
    inserted: items.filter((item) => item.status === "inserted").length,
    updated: items.filter((item) => item.status === "updated").length,
    skipped: items.filter((item) => item.status === "skipped").length,
  };
}

let activeCollection: Promise<ICollectionResult> | null = null;

export function collectLatestReleases(): Promise<ICollectionResult> {
  if (!activeCollection) {
    activeCollection = executeCollection().finally(() => {
      activeCollection = null;
    });
  }

  return activeCollection;
}
