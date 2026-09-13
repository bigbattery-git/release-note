import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

export const SUMMARY_MAX_OUTPUT_TOKENS = 2_000;

const releaseSummarySchema = z.object({
  bullets: z.array(z.string().trim().min(1)).min(1).max(10),
});

export interface ISummaryRequest {
  description: string;
  maxOutputTokens: number;
  model: string;
}

export type SummaryRequester = (
  request: ISummaryRequest,
) => Promise<unknown>;

let openAIClient: OpenAI | null = null;

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

function getOpenAIClient(): OpenAI {
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: requireEnvironment("OPENAI_API_SECRET_KEY"),
    });
  }

  return openAIClient;
}

async function requestSummary({
  description,
  maxOutputTokens,
  model,
}: ISummaryRequest): Promise<unknown> {
  const response = await getOpenAIClient().responses.parse({
    model,
    instructions: [
      "GitHub Release 원문을 개발자가 빠르게 이해할 수 있도록 한글로 요약한다.",
      "version, package name, API name, option, code identifier는 원문 표기를 유지한다.",
      "원문에 없는 내용을 추측하거나 추가하지 않는다.",
      "일반 Release는 핵심 변경 3~5개를 작성한다.",
      "변경이 많은 Release는 Breaking Changes, 보안, 주요 기능, 성능, migration 등으로 묶고 최대 10개까지 작성한다.",
      "호환성 파괴, 보안, migration 필요 사항과 사용자 영향이 큰 변경을 우선한다.",
      "각 bullet은 중복 없이 독립적으로 이해할 수 있는 간결한 문장으로 작성한다.",
    ].join("\n"),
    input: description,
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: "none" },
    store: false,
    text: {
      format: zodTextFormat(releaseSummarySchema, "release_summary"),
    },
  });

  return response.output_parsed;
}

/** Release description을 검증된 한글 bullet 목록으로 요약한다. */
export async function summarizeReleaseDescription(
  description: string,
  requester: SummaryRequester = requestSummary,
): Promise<string> {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    throw new Error("요약할 Release description이 없습니다.");
  }

  const parsed = releaseSummarySchema.parse(
    await requester({
      description: normalizedDescription,
      maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      model: requireEnvironment("OPENAI_MODEL"),
    }),
  );

  return parsed.bullets.map((bullet) => `- ${bullet}`).join("\n");
}
