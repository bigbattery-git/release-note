import assert from "node:assert/strict";
import test from "node:test";
import { isReleaseRecent, parseReleasePage } from "./history.ts";

test("created_at부터 정확히 7일까지 최근 Release로 판정한다", () => {
  const createdAt = "2026-09-13 10:00:00.000";

  assert.equal(isReleaseRecent(createdAt, createdAt), true);
  assert.equal(isReleaseRecent(createdAt, "2026-09-20 10:00:00.000"), true);
});

test("7일이 지났거나 created_at이 미래이면 최근 Release가 아니다", () => {
  const createdAt = "2026-09-13 10:00:00.000";

  assert.equal(isReleaseRecent(createdAt, "2026-09-20 10:00:00.001"), false);
  assert.equal(isReleaseRecent(createdAt, "2026-09-13 09:59:59.999"), false);
});

test("page 입력은 양의 안전한 정수만 허용한다", () => {
  assert.equal(parseReleasePage(undefined), 1);
  assert.equal(parseReleasePage("1"), 1);
  assert.equal(parseReleasePage("20"), 20);
  assert.equal(parseReleasePage("0"), null);
  assert.equal(parseReleasePage("1.5"), null);
  assert.equal(parseReleasePage(["1", "2"]), null);
  assert.equal(parseReleasePage(String(Number.MAX_SAFE_INTEGER)), null);
});
