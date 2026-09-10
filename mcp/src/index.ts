import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createReleaseDocsServer } from "./server.js";

serveStdio(createReleaseDocsServer);
