import assert from "node:assert/strict";
import test from "node:test";
import {
  createSummaryResult,
  type ISavedRelease,
  type ISummaryDependencies,
} from "./service.ts";
import type { ICollectedRelease } from "./types.ts";

const release: ICollectedRelease = {
  technology: "react",
  label: "React",
  externalId: "10",
  version: "v1.0.0",
  title: "Version 1",
  description: "Release notes",
  sourceUrl: "https://github.com/example/releases/10",
  changelogUrl: null,
  releasedAt: "2026-03-01 01:02:03.456",
};

function createDependencies(
  overrides: Partial<ISummaryDependencies> = {},
): ISummaryDependencies {
  return {
    persistSummary: async () => undefined,
    summarize: async () => "- 핵심 변경",
    ...overrides,
  };
}

test("기존 summary가 있으면 OpenAI를 호출하지 않고 보존한다", async () => {
  let summarizeCalled = false;
  const saved: ISavedRelease = {
    description: release.description,
    status: "skipped",
    summary: "- 기존 요약",
  };
  const result = await createSummaryResult(
    release,
    saved,
    createDependencies({
      summarize: async () => {
        summarizeCalled = true;
        return "- 새 요약";
      },
    }),
  );

  assert.equal(summarizeCalled, false);
  assert.equal(result.summaryStatus, "preserved");
  assert.equal(result.summary, "- 기존 요약");
});

test("description이 없으면 요약 대상이 아니라고 반환한다", async () => {
  const result = await createSummaryResult(
    { ...release, description: null },
    { description: null, status: "inserted", summary: null },
    createDependencies(),
  );

  assert.equal(result.summaryStatus, "not_applicable");
  assert.equal(result.summary, null);
});

test("요약 성공 결과를 저장하고 generated 상태를 반환한다", async () => {
  let persistedSummary: string | null = null;
  const result = await createSummaryResult(
    release,
    { description: release.description, status: "skipped", summary: null },
    createDependencies({
      persistSummary: async (_release, summary) => {
        persistedSummary = summary;
      },
    }),
  );

  assert.equal(persistedSummary, "- 핵심 변경");
  assert.equal(result.summaryStatus, "generated");
  assert.equal(result.summary, "- 핵심 변경");
});

test("요약 실패를 Release 저장 성공과 분리한 failed 상태로 반환한다", async () => {
  const result = await createSummaryResult(
    release,
    { description: release.description, status: "updated", summary: null },
    createDependencies({
      summarize: async () => {
        throw new Error("secret internal error");
      },
    }),
  );

  assert.equal(result.status, "updated");
  assert.equal(result.summaryStatus, "failed");
  assert.equal(result.summary, null);
  assert.match(result.summaryError ?? "", /React/);
  assert.doesNotMatch(result.summaryError ?? "", /secret|internal/);
});
