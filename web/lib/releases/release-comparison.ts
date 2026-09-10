import type { ITechnologyReleaseTable } from "../database";
import type { ICollectedRelease } from "./types";

type ExistingRelease = Pick<
  ITechnologyReleaseTable,
  | "version"
  | "title"
  | "description"
  | "source_url"
  | "changelog_url"
  | "released_at"
>;

export function hasReleaseChanged(
  existing: ExistingRelease,
  incoming: ICollectedRelease,
): boolean {
  return (
    existing.version !== incoming.version ||
    existing.title !== incoming.title ||
    existing.description !== incoming.description ||
    existing.source_url !== incoming.sourceUrl ||
    existing.changelog_url !== incoming.changelogUrl ||
    existing.released_at !== incoming.releasedAt
  );
}
