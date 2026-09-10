import { readFile, readdir } from "node:fs/promises";
import { createConnection } from "mysql2/promise";

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

const databaseName = process.env.DB_NAME ?? "release";

if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error("DB_NAME은 영문자, 숫자와 밑줄만 사용할 수 있습니다.");
}

const connection = await createConnection({
  host: requireEnvironment("DB_HOST"),
  port: Number(process.env.DB_PORT ?? "3306"),
  user: requireEnvironment("DB_USER"),
  password: requireEnvironment("DB_PASSWORD"),
  multipleStatements: true,
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.query(`USE \`${databaseName}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);

  const migrationsDirectory = new URL("../migrations/", import.meta.url);
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort();

  for (const fileName of migrationFiles) {
    const [rows] = await connection.execute(
      "SELECT name FROM app_migrations WHERE name = ?",
      [fileName],
    );

    if (Array.isArray(rows) && rows.length > 0) {
      continue;
    }

    const migration = await readFile(new URL(fileName, migrationsDirectory), "utf8");

    await connection.query(migration);
    await connection.execute("INSERT INTO app_migrations (name) VALUES (?)", [
      fileName,
    ]);
    console.log(`${fileName} 적용 완료`);
  }
} finally {
  await connection.end();
}
