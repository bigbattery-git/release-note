import assert from "node:assert/strict";
import test from "node:test";
import {
  createSummaryWarning,
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
    summary: "- 기존 요약",
  };
  const warning = await createSummaryWarning(
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
  assert.equal(warning, null);
});

test("description이 없으면 요약 대상이 아니라고 반환한다", async () => {
  const warning = await createSummaryWarning(
    { ...release, description: null },
    { description: null, summary: null },
    createDependencies(),
  );

  assert.equal(warning, null);
});

test("요약 성공 결과를 저장하고 경고를 반환하지 않는다", async () => {
  let persistedSummary: string | null = null;
  const warning = await createSummaryWarning(
    release,
    { description: release.description, summary: null },
    createDependencies({
      persistSummary: async (_release, summary) => {
        persistedSummary = summary;
      },
    }),
  );

  assert.equal(persistedSummary, "- 핵심 변경");
  assert.equal(warning, null);
});

test("요약 실패를 Release 저장 성공과 분리한 안전한 경고로 반환한다", async () => {
  const warning = await createSummaryWarning(
    release,
    { description: release.description, summary: null },
    createDependencies({
      summarize: async () => {
        throw new Error("secret internal error");
      },
    }),
  );

  assert.match(warning ?? "", /React/);
  assert.doesNotMatch(warning ?? "", /secret|internal/);
});
