import { type Kysely, sql } from "kysely";

/** Release 원문의 한글 요약을 저장할 nullable column을 추가한다. */
export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("technology_releases")
    .addColumn("summary", sql`longtext`)
    .execute();
}

/** Release 요약 column을 제거한다. */
export async function down(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("technology_releases")
    .dropColumn("summary")
    .execute();
}
