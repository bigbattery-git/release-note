import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLatestTechnologyReleases,
  fetchTechnologyReleasePage,
  RELEASE_QUERY_TIMING,
  ReleaseQueryError,
  releaseQueryKeys,
  retryReleaseQuery,
} from "./client.ts";

test("Release query는 60초 freshness와 polling 값을 사용한다", () => {
  assert.deepEqual(RELEASE_QUERY_TIMING, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
});

test("technology query key는 technology와 page 입력을 구분한다", () => {
  assert.notDeepEqual(
    releaseQueryKeys.technology("nextjs", ["1"]),
    releaseQueryKeys.technology("nextjs", ["2"]),
  );
  assert.notDeepEqual(
    releaseQueryKeys.technology("nextjs", ["1"]),
    releaseQueryKeys.technology("react", ["1"]),
  );
});

test("latest client는 no-store GET API 응답을 읽는다", async () => {
  let requestedInput: RequestInfo | URL | undefined;
  let requestedInit: RequestInit | undefined;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedInput = input;
    requestedInit = init;
    return Response.json({ data: [] });
  };

  assert.deepEqual(await fetchLatestTechnologyReleases(fetcher), []);
  assert.equal(requestedInput, "/api/releases/latest");
  assert.equal(requestedInit?.cache, "no-store");
});

test("technology client는 technology와 중복 page 입력을 보존한다", async () => {
  let requestedInput: RequestInfo | URL | undefined;
  const fetcher = async (input: RequestInfo | URL) => {
    requestedInput = input;
    return Response.json({
      data: {
        technology: "next js",
        displayName: "Next.js",
        items: [],
        page: 1,
        hasNext: false,
      },
    });
  };

  await fetchTechnologyReleasePage("next js", ["1", "2"], fetcher);

  assert.equal(
    requestedInput,
    "/api/technologies/next%20js/releases?page=1&page=2",
  );
});

test("non-2xx API 응답은 status를 가진 query error가 된다", async () => {
  const fetcher = async () =>
    Response.json({ error: "찾을 수 없습니다." }, { status: 404 });

  await assert.rejects(
    () => fetchTechnologyReleasePage("missing", ["1"], fetcher),
    (error) =>
      error instanceof ReleaseQueryError &&
      error.status === 404 &&
      error.message === "찾을 수 없습니다.",
  );
});

test("성공 응답 형식이 잘못되면 안전한 fallback error가 된다", async () => {
  const fetcher = async () => Response.json({ unexpected: true });

  await assert.rejects(
    () => fetchLatestTechnologyReleases(fetcher),
    (error) =>
      error instanceof ReleaseQueryError &&
      error.status === 500 &&
      error.message === "최신 Release를 불러오는 중 오류가 발생했습니다.",
  );
});

test("복구 불가능한 4xx는 retry하지 않고 일시적 오류만 제한한다", () => {
  assert.equal(retryReleaseQuery(0, new ReleaseQueryError("invalid", 400)), false);
  assert.equal(retryReleaseQuery(0, new ReleaseQueryError("server", 500)), true);
  assert.equal(retryReleaseQuery(2, new TypeError("network")), true);
  assert.equal(retryReleaseQuery(3, new TypeError("network")), false);
});
