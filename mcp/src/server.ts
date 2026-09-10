import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";

export const RELEASE_GUIDE_URI =
  "news-summary://docs/github-release-implementation-guide";
export const RELEASE_GUIDE_TOOL = "read_github_release_implementation_guide";

const defaultGuidePath = fileURLToPath(
  new URL("../../docs/technology_update_api_research.md", import.meta.url),
);

async function readReleaseGuide(): Promise<string> {
  const guidePath = process.env.RELEASE_GUIDE_PATH ?? defaultGuidePath;
  return readFile(guidePath, "utf8");
}

/** GitHub Release 구현 기준 문서를 제공하는 read-only MCP server를 만든다. */
export function createReleaseDocsServer(): McpServer {
  const server = new McpServer(
    {
      name: "news-summary-release-docs",
      version: "0.1.0",
    },
    {
      instructions:
        "GitHub Release 수집 기능을 구현하거나 변경하기 전에 제공된 resource 또는 read tool로 기준 문서를 읽고 API 계약을 따른다.",
    },
  );

  server.registerResource(
    "github-release-implementation-guide",
    RELEASE_GUIDE_URI,
    {
      title: "GitHub Release 수집 구현 가이드",
      description:
        "news-summery에서 GitHub Release 수집 기능을 구현할 때 따라야 하는 API 계약, header, 응답 타입과 polling 기준",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await readReleaseGuide(),
        },
      ],
    }),
  );

  server.registerTool(
    RELEASE_GUIDE_TOOL,
    {
      title: "GitHub Release 구현 가이드 읽기",
      description:
        "GitHub Release 수집 기능을 구현하거나 수정하기 전에 저장소의 최신 구현 기준 문서를 읽는다.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [{ type: "text", text: await readReleaseGuide() }],
    }),
  );

  return server;
}
