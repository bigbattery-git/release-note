import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getJson } from './api-client.js';

type ToolSpec = { name: string; description: string; path: string };
const tools: ToolSpec[] = [
  { name: 'get_war', description: '현재 은하 전쟁 전체 현황을 조회합니다.', path: '/api/v1/war' },
  { name: 'list_planets', description: '모든 행성 정보를 조회합니다.', path: '/api/v1/planets' },
  { name: 'list_campaigns', description: '진행 중인 캠페인을 조회합니다.', path: '/api/v1/campaigns' },
  { name: 'list_assignments', description: '현재 주요 명령(Major Orders)을 조회합니다.', path: '/api/v1/assignments' },
  { name: 'list_dispatches', description: '사령부 지령을 조회합니다.', path: '/api/v2/dispatches' },
  { name: 'list_planet_events', description: '활성 이벤트가 있는 행성을 조회합니다.', path: '/api/v1/planet-events' },
  { name: 'list_space_stations', description: '민주주의 우주 정거장을 조회합니다.', path: '/api/v2/space-stations' },
  { name: 'list_steam_news', description: 'Helldivers 2 Steam 뉴스를 조회합니다.', path: '/api/v1/steam' },
];

export function createServer() {
  const server = new McpServer({ name: 'helldivers2-api', version: '0.1.0' });
  for (const spec of tools) {
    server.registerTool(spec.name, { description: spec.description, inputSchema: {} }, async () => {
      try {
        const data = await getJson<unknown>(spec.path);
        return { content: [{ type: 'text', text: JSON.stringify({ data, source: spec.path, fetchedAt: new Date().toISOString() }) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
  server.registerTool('get_planet', { description: 'index로 특정 행성을 조회합니다.', inputSchema: { index: z.number().int() } }, async ({ index }) => {
    try {
      const data = await getJson<unknown>(`/api/v1/planets/${index}`);
      return { content: [{ type: 'text', text: JSON.stringify({ data, source: `/api/v1/planets/${index}`, fetchedAt: new Date().toISOString() }) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
  return server;
}
