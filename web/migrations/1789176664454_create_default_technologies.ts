import { type Kysely, sql } from "kysely";

/** 기본 technology catalog를 만들고 Release table과 연결한다. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .createTable("default_technologies")
    .addColumn("technology", "varchar(50)", (column) =>
      column
        .modifyFront(sql`CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        .notNull()
        .primaryKey(),
    )
    .addColumn("display_name", "varchar(100)", (column) => column.notNull())
    .addColumn("releases_path", "varchar(255)", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("sort_order", "integer", (column) =>
      column.unsigned().notNull().defaultTo(0),
    )
    .addColumn("created_at", "datetime(3)", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP(3)`),
    )
    .addColumn("updated_at", "datetime(3)", (column) =>
      column
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP(3)`)
        .modifyEnd(sql`ON UPDATE CURRENT_TIMESTAMP(3)`),
    )
    .addUniqueConstraint("uq_default_technologies_releases_path", [
      "releases_path",
    ])
    .execute();

  await database
    .insertInto("default_technologies")
    .values([
      {
        technology: "nextjs",
        display_name: "Next.js",
        releases_path: "/repos/vercel/next.js/releases",
        enabled: true,
        sort_order: 10,
      },
      {
        technology: "nodejs",
        display_name: "Node.js",
        releases_path: "/repos/nodejs/node/releases",
        enabled: true,
        sort_order: 20,
      },
      {
        technology: "react",
        display_name: "React",
        releases_path: "/repos/react/react/releases",
        enabled: true,
        sort_order: 30,
      },
    ])
    .execute();

  await database.schema
    .alterTable("technology_releases")
    .modifyColumn("technology", "varchar(50)", (column) =>
      column
        .modifyFront(sql`CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
        .notNull(),
    )
    .execute();

  await database.schema
    .alterTable("technology_releases")
    .addForeignKeyConstraint(
      "fk_technology_releases_technology",
      ["technology"],
      "default_technologies",
      ["technology"],
      (constraint) => constraint.onUpdate("cascade").onDelete("restrict"),
    )
    .execute();
}

/** catalog 연결을 해제하고 기본 technology table을 제거한다. */
export async function down(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("technology_releases")
    .dropConstraint("fk_technology_releases_technology")
    .execute();

  await database.schema
    .alterTable("technology_releases")
    .modifyColumn(
      "technology",
      sql`enum('nextjs', 'nodejs', 'react')`,
      (column) => column.notNull(),
    )
    .execute();

  await database.schema.dropTable("default_technologies").execute();
}
