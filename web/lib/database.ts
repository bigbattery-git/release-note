import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

type Database = Record<string, never>;

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

function createDatabase(): Kysely<Database> {
  const databaseName = process.env.DB_NAME || undefined;

  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: requireEnvironment("DB_HOST"),
        port: Number(process.env.DB_PORT ?? "3306"),
        user: requireEnvironment("DB_USER"),
        password: requireEnvironment("DB_PASSWORD"),
        database: databaseName,
        connectionLimit: 10,
      }),
    }),
  });
}

const globalDatabase = globalThis as typeof globalThis & {
  newsSummaryDatabase?: Kysely<Database>;
};

/** 개발 중 hot reload에서도 connection pool을 하나만 유지하는 DB client다. */
export const database = globalDatabase.newsSummaryDatabase ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalDatabase.newsSummaryDatabase = database;
}

/** schema를 변경하지 않고 MariaDB 연결 상태를 확인한다. */
export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await sql<{ value: number }>`SELECT 1 AS value`.execute(database);

  return Number(result.rows[0]?.value) === 1;
}
