import { type Generated, Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

export interface ITechnologyReleaseTable {
  id: Generated<string>;
  technology: string;
  external_id: string;
  version: string;
  title: string;
  description: string | null;
  source_url: string | null;
  changelog_url: string | null;
  released_at: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IDefaultTechnologyTable {
  technology: string;
  display_name: string;
  releases_path: string;
  enabled: number;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IDatabase {
  default_technologies: IDefaultTechnologyTable;
  technology_releases: ITechnologyReleaseTable;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

function createDatabase(): Kysely<IDatabase> {
  const databaseName = process.env.DB_NAME || undefined;

  return new Kysely<IDatabase>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: requireEnvironment("DB_HOST"),
        port: Number(process.env.DB_PORT ?? "3306"),
        user: requireEnvironment("DB_USER"),
        password: requireEnvironment("DB_PASSWORD"),
        database: databaseName,
        connectionLimit: 10,
        dateStrings: true,
      }),
    }),
  });
}

const globalDatabase = globalThis as typeof globalThis & {
  newsSummaryDatabase?: Kysely<IDatabase>;
};

/** build 시점에는 연결하지 않고, 개발 중 hot reload에서는 pool 하나를 재사용한다. */
export function getDatabase(): Kysely<IDatabase> {
  if (!globalDatabase.newsSummaryDatabase) {
    globalDatabase.newsSummaryDatabase = createDatabase();
  }

  return globalDatabase.newsSummaryDatabase;
}

/** schema를 변경하지 않고 MariaDB 연결 상태를 확인한다. */
export async function checkDatabaseConnection(): Promise<boolean> {
  const database = getDatabase();
  const result = await sql<{ value: number }>`SELECT 1 AS value`.execute(database);

  return Number(result.rows[0]?.value) === 1;
}
