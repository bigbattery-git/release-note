import { fileURLToPath } from "node:url";
import { type Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { defineConfig, TSFileMigrationProvider } from "kysely-ctl";
import { createPool } from "mysql2";

const MIGRATION_NAME_CHANGES = {
  "001_create_technology_releases":
    "1789176662639_create_technology_releases",
  "002_create_default_technologies":
    "1789176664454_create_default_technologies",
} as const;

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경 변수가 필요합니다.`);
  }

  return value;
}

/** 기존 순번형 migration 이력을 CLI timestamp 파일명으로 변환한다. */
async function migrateLegacyHistory(database: Kysely<any>): Promise<void> {
  const tables = await database.introspection.getTables({
    withInternalKyselyTables: true,
  });
  const hasLegacyTable = tables.some(
    (table) => table.name === "app_migrations",
  );
  let hasKyselyTable = tables.some(
    (table) => table.name === "kysely_migration",
  );

  if (!hasLegacyTable && !hasKyselyTable) {
    return;
  }

  if (!hasKyselyTable) {
    await database.schema
      .createTable("kysely_migration")
      .addColumn("name", "varchar(255)", (column) =>
        column.notNull().primaryKey(),
      )
      .addColumn("timestamp", "varchar(255)", (column) => column.notNull())
      .execute();
    hasKyselyTable = true;
  }

  if (hasKyselyTable) {
    const migrations = await database
      .selectFrom("kysely_migration")
      .select("name")
      .execute();
    const migrationNames = new Set(
      migrations.map(({ name }: { name: string }) => name),
    );

    for (const [oldName, newName] of Object.entries(MIGRATION_NAME_CHANGES)) {
      if (!migrationNames.has(oldName)) {
        continue;
      }

      if (migrationNames.has(newName)) {
        await database
          .deleteFrom("kysely_migration")
          .where("name", "=", oldName)
          .execute();
      } else {
        await database
          .updateTable("kysely_migration")
          .set({ name: newName })
          .where("name", "=", oldName)
          .execute();
        migrationNames.add(newName);
      }
    }
  }

  if (!hasLegacyTable) {
    return;
  }

  const legacyMigrations = await database
    .selectFrom("app_migrations")
    .select(["name", "applied_at"])
    .execute();

  for (const migration of legacyMigrations as Array<{
    name: string;
    applied_at: Date | string;
  }>) {
    const oldName = migration.name.replace(/\.sql$/, "");
    const newName =
      MIGRATION_NAME_CHANGES[oldName as keyof typeof MIGRATION_NAME_CHANGES];

    if (!newName) {
      throw new Error(`변환할 수 없는 기존 migration 이력입니다: ${migration.name}`);
    }

    await database
      .insertInto("kysely_migration")
      .ignore()
      .values({
        name: newName,
        timestamp: new Date(migration.applied_at).toISOString(),
      })
      .execute();
  }
}

export default defineConfig({
  dialect: "mysql2",
  dialectConfig: () => ({
    pool: createPool({
      host: requireEnvironment("DB_HOST"),
      port: Number(process.env.DB_PORT ?? "3306"),
      user: requireEnvironment("DB_USER"),
      password: requireEnvironment("DB_PASSWORD"),
      database: process.env.DB_NAME ?? "release",
      connectionLimit: 10,
      dateStrings: true,
    }),
  }),
  migrations: {
    migrator: async (database) => {
      await migrateLegacyHistory(database);

      return new Migrator({
        db: database,
        provider: new TSFileMigrationProvider({
          migrationFolder: fileURLToPath(
            new URL("./migrations", import.meta.url),
          ),
        }),
      });
    },
  },
});
