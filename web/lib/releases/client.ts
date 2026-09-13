import type {
  ILatestTechnologyRelease,
  ITechnologyReleasePage,
} from "./history.ts";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const RELEASE_QUERY_TIMING = {
  staleTime: 60_000,
  refetchInterval: 60_000,
} as const;

export const releaseQueryKeys = {
  latest: ["releases", "latest"] as const,
  technology: (technology: string, pageValues: readonly string[]) =>
    ["releases", "technology", technology, pageValues] as const,
};

export class ReleaseQueryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReleaseQueryError";
    this.status = status;
  }
}

export function retryReleaseQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ReleaseQueryError && error.status < 500) {
    return false;
  }

  return failureCount < 3;
}

async function readApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ReleaseQueryError(
      fallbackMessage,
      response.ok ? 500 : response.status,
    );
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallbackMessage;

    throw new ReleaseQueryError(errorMessage, response.status);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    payload.data === undefined
  ) {
    throw new ReleaseQueryError(fallbackMessage, 500);
  }

  return payload.data as T;
}

export async function fetchLatestTechnologyReleases(
  fetcher: Fetcher = fetch,
): Promise<ILatestTechnologyRelease[]> {
  const response = await fetcher("/api/releases/latest", { cache: "no-store" });

  return readApiResponse(
    response,
    "최신 Release를 불러오는 중 오류가 발생했습니다.",
  );
}

export async function fetchTechnologyReleasePage(
  technology: string,
  pageValues: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<ITechnologyReleasePage> {
  const searchParams = new URLSearchParams();
  pageValues.forEach((page) => searchParams.append("page", page));
  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
  const response = await fetcher(
    `/api/technologies/${encodeURIComponent(technology)}/releases${query}`,
    { cache: "no-store" },
  );

  return readApiResponse(
    response,
    "Release 이력을 불러오는 중 오류가 발생했습니다.",
  );
}
