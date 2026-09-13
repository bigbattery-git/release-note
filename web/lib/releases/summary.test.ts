import assert from "node:assert/strict";
import test from "node:test";
import {
  SUMMARY_MAX_OUTPUT_TOKENS,
  summarizeReleaseDescription,
} from "./summary.ts";

async function withModel<T>(callback: () => Promise<T>): Promise<T> {
  const originalModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_MODEL = "gpt-5.6-terra";

  try {
    return await callback();
  } finally {
    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  }
}

test("검증된 bullet을 저장 가능한 Markdown text로 변환한다", async () => {
  await withModel(async () => {
    const summary = await summarizeReleaseDescription(
      "  Release notes  ",
      async (request) => {
        assert.equal(request.model, "gpt-5.6-terra");
        assert.equal(request.description, "Release notes");
        assert.equal(request.maxOutputTokens, SUMMARY_MAX_OUTPUT_TOKENS);

        return {
          bullets: ["Breaking Change를 확인해야 합니다.", "성능이 개선되었습니다."],
        };
      },
    );

    assert.equal(
      summary,
      "- Breaking Change를 확인해야 합니다.\n- 성능이 개선되었습니다.",
    );
  });
});

test("10개를 초과한 bullet 응답을 거부한다", async () => {
  await withModel(async () => {
    await assert.rejects(
      summarizeReleaseDescription("Release notes", async () => ({
        bullets: Array.from({ length: 11 }, (_, index) => `변경 ${index + 1}`),
      })),
    );
  });
});

test("OPENAI_MODEL이 없으면 요청하지 않고 실패한다", async () => {
  const originalModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_MODEL;
  let called = false;

  try {
    await assert.rejects(
      summarizeReleaseDescription("Release notes", async () => {
        called = true;
        return { bullets: ["요약"] };
      }),
      /OPENAI_MODEL/,
    );
    assert.equal(called, false);
  } finally {
    if (originalModel !== undefined) {
      process.env.OPENAI_MODEL = originalModel;
    }
  }
});

test("빈 description을 요청하지 않고 거부한다", async () => {
  await withModel(async () => {
    let called = false;

    await assert.rejects(
      summarizeReleaseDescription("   ", async () => {
        called = true;
        return { bullets: ["요약"] };
      }),
      /description/,
    );
    assert.equal(called, false);
  });
});
