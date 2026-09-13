import assert from "node:assert/strict";
import test from "node:test";
import {
  hasReleaseChanged,
  hasReleaseDescriptionChanged,
} from "./release-comparison.ts";
import {
  fetchLatestStableRelease,
  GitHubReleaseError,
  parseGitHubReleases,
  selectLatestStableRelease,
  toMariaDbDateTime,
} from "./github.ts";
import type { ICollectedRelease } from "./types";

const stableOld = {
  id: 1,
  tag_name: "v1.0.0",
  name: "Version 1",
  body: "old",
  draft: false,
  prerelease: false,
  published_at: "2026-01-01T00:00:00Z",
  html_url: "https://github.com/example/releases/1",
};

test("최신 안정 Release만 선택한다", () => {
  const releases = parseGitHubReleases([
    stableOld,
    {
      ...stableOld,
      id: 2,
      tag_name: "v2.0.0-rc.1",
      prerelease: true,
      published_at: "2026-04-01T00:00:00Z",
    },
    {
      ...stableOld,
      id: 3,
      tag_name: "v1.1.0",
      published_at: "2026-03-01T00:00:00Z",
    },
    {
      ...stableOld,
      id: 4,
      tag_name: "v3.0.0",
      draft: true,
      published_at: "2026-05-01T00:00:00Z",
    },
  ]);

  assert.equal(selectLatestStableRelease(releases)?.id, 3);
});

test("필수 필드가 없는 응답을 거부한다", () => {
  assert.throws(() => parseGitHubReleases([{ id: 1 }]));
});

test("UTC ISO 발행일을 MariaDB DATETIME 형식으로 바꾼다", () => {
  assert.equal(
    toMariaDbDateTime("2026-03-01T01:02:03.456Z"),
    "2026-03-01 01:02:03.456",
  );
});

test("동일한 Release와 수정된 Release를 구분한다", () => {
  const incoming: ICollectedRelease = {
    technology: "react",
    label: "React",
    externalId: "10",
    version: "v1.0.0",
    title: "Version 1",
    description: "notes",
    sourceUrl: "https://github.com/example/releases/10",
    changelogUrl: null,
    releasedAt: "2026-03-01 01:02:03.456",
  };
  const existing = {
    version: incoming.version,
    title: incoming.title,
    description: incoming.description,
    source_url: incoming.sourceUrl,
    changelog_url: incoming.changelogUrl,
    released_at: incoming.releasedAt,
  };

  assert.equal(hasReleaseChanged(existing, incoming), false);
  assert.equal(
    hasReleaseChanged({ ...existing, description: "changed" }, incoming),
    true,
  );
  assert.equal(
    hasReleaseDescriptionChanged(existing.description, incoming.description),
    false,
  );
  assert.equal(
    hasReleaseDescriptionChanged("changed", incoming.description),
    true,
  );
});

test("token이 비어 있으면 인증 header 없이 Release를 조회한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;

  process.env.GITHUB_TOKEN = "";
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /repos\/vercel\/next\.js\/releases/);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      undefined,
    );

    return new Response(JSON.stringify([stableOld]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const release = await fetchLatestStableRelease({
      technology: "nextjs",
      label: "Next.js",
      releasesPath: "/repos/vercel/next.js/releases",
    });
    assert.equal(release.externalId, "1");
    assert.equal(release.technology, "nextjs");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
});

test("rate limit 응답을 대상이 포함된 안전한 오류로 바꾼다", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 429 });

  try {
    await assert.rejects(
      fetchLatestStableRelease({
        technology: "nodejs",
        label: "Node.js",
        releasesPath: "/repos/nodejs/node/releases",
      }),
      (error: unknown) =>
        error instanceof GitHubReleaseError &&
        error.technology === "nodejs" &&
        error.publicMessage.includes("Node.js") &&
        !error.publicMessage.includes("token"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
