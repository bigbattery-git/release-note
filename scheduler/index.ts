import cron from "node-cron";

// 환경 변수가 없을 때 사용하는 기본값이다.
// `web`은 Docker Compose 내부에서 접근하는 service 이름이며 외부 도메인이 아니다.
const DEFAULT_COLLECTION_URL = "http://web:3000/api/releases/collect";
// 숫자 사이의 `_`는 자릿수 구분용이므로 실제 값은 300000ms, 즉 5분이다.
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

interface ISchedulerConfiguration {
  collectionUrl: string;
  requestTimeoutMs: number;
}

interface ICollectionSuccessResponse {
  success: true;
  warnings: string[];
}

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  console.log(`${new Date().toISOString()} [${level}] ${message}`);
}

/**
 * Compose가 전달한 환경 변수를 읽고 scheduler가 사용할 수 있는 값인지 확인한다.
 * 환경 변수가 비어 있으면 위의 기본값을 사용하므로 Compose 없이 직접 실행해도 설정을 읽을 수 있다.
 */
function loadConfiguration(): ISchedulerConfiguration {
  const collectionUrl =
    process.env.RELEASE_COLLECTION_URL?.trim() || DEFAULT_COLLECTION_URL;
  const timeoutValue =
    process.env.SCHEDULER_REQUEST_TIMEOUT_MS?.trim() ||
    String(DEFAULT_REQUEST_TIMEOUT_MS);
  const requestTimeoutMs = Number(timeoutValue);
  const parsedUrl = new URL(collectionUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("unsupported collection URL protocol");
  }

  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("invalid scheduler request timeout");
  }

  return {
    collectionUrl: parsedUrl.toString(),
    requestTimeoutMs,
  };
}

function isCollectionSuccessResponse(
  value: unknown,
): value is ICollectionSuccessResponse {
  // HTTP JSON은 실행 전까지 형태를 알 수 없으므로 `unknown`에서 필요한 필드를 직접 검사한다.
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;

  return (
    response.success === true &&
    Array.isArray(response.warnings) &&
    response.warnings.every((warning) => typeof warning === "string")
  );
}

let configuration: ISchedulerConfiguration;

try {
  configuration = loadConfiguration();
} catch {
  log(
    "ERROR",
    "scheduler 설정이 올바르지 않습니다. RELEASE_COLLECTION_URL과 SCHEDULER_REQUEST_TIMEOUT_MS를 확인해 주세요.",
  );
  process.exit(1);
}

let activeRequestController: AbortController | null = null;
// 종료 절차가 시작된 뒤 cron callback이 새 요청을 시작하지 않게 한다.
let shuttingDown = false;

/**
 * 실제 GitHub·DB·OpenAI 로직을 복제하지 않고 web의 기존 API에 실행을 요청한다.
 * 이 함수가 반환하는 Promise가 끝나야 node-cron이 현재 실행의 완료를 알 수 있다.
 */
async function requestReleaseCollection(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  const shutdownController = new AbortController();
  // 설정한 시간이 지나면 자동으로 abort되는 signal이다.
  const timeoutSignal = AbortSignal.timeout(configuration.requestTimeoutMs);
  // 종료 요청과 timeout 중 하나라도 발생하면 같은 fetch를 중단한다.
  const requestSignal = AbortSignal.any([
    shutdownController.signal,
    timeoutSignal,
  ]);
  activeRequestController = shutdownController;
  log("INFO", "Release 수집·요약 실행을 시작합니다.");

  try {
    const response = await fetch(configuration.collectionUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
      },
      signal: requestSignal,
    });

    let payload: unknown;

    try {
      // HTTP 200이어도 JSON이 아니면 정상 API 응답으로 처리할 수 없다.
      payload = await response.json();
    } catch {
      log("ERROR", "Release 수집·요약 응답 형식을 확인할 수 없습니다.");
      return;
    }

    if (!response.ok) {
      log(
        "ERROR",
        `Release 수집·요약 요청이 HTTP ${response.status}로 실패했습니다.`,
      );
      return;
    }

    if (!isCollectionSuccessResponse(payload)) {
      log("ERROR", "Release 수집·요약 요청이 실패 응답을 반환했습니다.");
      return;
    }

    log("INFO", "Release 수집·요약 실행을 완료했습니다.");

    if (payload.warnings.length > 0) {
      log(
        "WARN",
        `Release 수집·요약 경고: ${JSON.stringify(payload.warnings)}`,
      );
    }
  } catch {
    // 같은 fetch abort라도 종료 요청과 timeout을 운영 로그에서 구분한다.
    if (shutdownController.signal.aborted) {
      log("WARN", "scheduler 종료로 진행 중인 HTTP 요청을 취소했습니다.");
      return;
    }

    if (timeoutSignal.aborted) {
      log(
        "ERROR",
        `Release 수집·요약 요청이 ${configuration.requestTimeoutMs}ms 후 timeout되었습니다.`,
      );
      return;
    }

    log("ERROR", "Release 수집·요약 API에 연결하지 못했습니다.");
  } finally {
    // 성공과 모든 실패 경로에서 현재 요청 참조를 정리한다.
    if (activeRequestController === shutdownController) {
      activeRequestController = null;
    }
  }
}

// 5-field cron에서 `* * * * *`는 매분 0초에 실행한다.
// noOverlap은 이 callback의 Promise가 끝나기 전에 다음 분이 오면 새 실행을 건너뛴다.
// 이 상태는 현재 scheduler process 안에서만 관리되며 다른 container와 공유되지 않는다.
const task = cron.schedule("* * * * *", requestReleaseCollection, {
  name: "release-collection",
  noOverlap: true,
});

// noOverlap 때문에 실행되지 않은 tick도 장애 분석이 가능하도록 별도 로그를 남긴다.
task.on("execution:overlap", () => {
  log("WARN", "이전 실행이 진행 중이므로 이번 cron tick을 건너뜁니다.");
});

log(
  "INFO",
  `scheduler를 시작했습니다. 요청 timeout은 ${configuration.requestTimeoutMs}ms입니다.`,
);

// SIGINT는 터미널 중단, SIGTERM은 Docker 같은 실행 환경의 정상 종료 요청에 주로 사용된다.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    log("INFO", `${signal} 신호를 받아 scheduler를 종료합니다.`);
    // 먼저 cron을 제거해 새 tick을 막고, 진행 중인 HTTP 요청이 있으면 그다음 취소한다.
    await task.destroy();
    activeRequestController?.abort();
    process.exit(0);
  });
}
