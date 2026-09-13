import type { Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .createIndex("idx_technology_releases_history")
    .on("technology_releases")
    .columns(["technology", "created_at", "id"])
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(database: Kysely<any>): Promise<void> {
  await database.schema
    .dropIndex("idx_technology_releases_history")
    .on("technology_releases")
    .execute();
}
