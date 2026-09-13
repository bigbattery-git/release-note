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

/**
 * 이전 release와 새로 수집한 release를 비교하여 변경사항이 있는지 확인함
 * @param existing 
 * @param incoming 
 * @returns 
 */
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

/** Release 원문이 바뀌어 기존 요약을 무효화해야 하는지 판정한다. */
export function hasReleaseDescriptionChanged(
  existingDescription: string | null,
  incomingDescription: string | null,
): boolean {
  return existingDescription !== incomingDescription;
}
