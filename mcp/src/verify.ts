import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { RELEASE_GUIDE_TOOL, RELEASE_GUIDE_URI } from "./server.js";

const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
const sourcePath = fileURLToPath(
  new URL("../../docs/technology_update_api_research.md", import.meta.url),
);

async function connect(extraEnvironment: Record<string, string> = {}) {
  const client = new Client({ name: "release-docs-verifier", version: "0.1.0" });
  const environment = Object.fromEntries(
    Object.entries({ ...process.env, ...extraEnvironment }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: environment,
    stderr: "pipe",
  });

  await client.connect(transport);
  return client;
}

const source = await readFile(sourcePath, "utf8");
const client = await connect();

try {
  const { resources } = await client.listResources();
  const guide = resources.find((resource) => resource.uri === RELEASE_GUIDE_URI);
  assert.ok(guide, "GitHub Release guide resource를 찾을 수 없습니다.");
  assert.match(guide.description ?? "", /GitHub Release/);

  const resourceResult = await client.readResource({ uri: RELEASE_GUIDE_URI });
  const resourceContent = resourceResult.contents[0];
  assert.ok(resourceContent && "text" in resourceContent);
  assert.equal(resourceContent.text, source);

  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === RELEASE_GUIDE_TOOL));

  const toolResult = await client.callTool({ name: RELEASE_GUIDE_TOOL });
  assert.equal(toolResult.content[0]?.type, "text");
  if (toolResult.content[0]?.type === "text") {
    assert.equal(toolResult.content[0].text, source);
  }
} finally {
  await client.close();
}

const missingDocumentClient = await connect({
  RELEASE_GUIDE_PATH: fileURLToPath(new URL("./missing-guide.md", import.meta.url)),
});

try {
  await assert.rejects(
    missingDocumentClient.readResource({ uri: RELEASE_GUIDE_URI }),
  );
  const { resources } = await missingDocumentClient.listResources();
  assert.ok(resources.some((resource) => resource.uri === RELEASE_GUIDE_URI));
} finally {
  await missingDocumentClient.close();
}

console.log("MCP protocol 검증 완료");
