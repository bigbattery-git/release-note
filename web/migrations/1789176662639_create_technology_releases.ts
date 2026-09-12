import { type Kysely, sql } from "kysely";

/** Release 저장 table과 source별 중복 방지 constraint를 생성한다. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .createTable("technology_releases")
    .addColumn("id", "bigint", (column) =>
      column.unsigned().notNull().autoIncrement().primaryKey(),
    )
    .addColumn(
      "technology",
      sql`enum('nextjs', 'nodejs', 'react')`,
      (column) => column.notNull(),
    )
    .addColumn("external_id", "varchar(64)", (column) => column.notNull())
    .addColumn("version", "varchar(100)", (column) => column.notNull())
    .addColumn("title", "varchar(255)", (column) => column.notNull())
    .addColumn("description", sql`longtext`)
    .addColumn("source_url", "varchar(2048)")
    .addColumn("changelog_url", "varchar(2048)")
    .addColumn("released_at", "datetime(3)", (column) => column.notNull())
    .addColumn("created_at", "datetime(3)", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP(3)`),
    )
    .addColumn("updated_at", "datetime(3)", (column) =>
      column
        .notNull()
        .defaultTo(sql`CURRENT_TIMESTAMP(3)`)
        .modifyEnd(sql`ON UPDATE CURRENT_TIMESTAMP(3)`),
    )
    .addUniqueConstraint("uq_technology_releases_source", [
      "technology",
      "external_id",
    ])
    .execute();
}

/** Release 저장 table을 제거한다. */
export async function down(database: Kysely<any>): Promise<void> {
  await database.schema.dropTable("technology_releases").execute();
}
