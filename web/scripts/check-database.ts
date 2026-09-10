import { checkDatabaseConnection, getDatabase } from "../lib/database.ts";

try {
  const connected = await checkDatabaseConnection();

  if (!connected) {
    throw new Error("SELECT 1 결과가 예상과 다릅니다.");
  }

  console.log("MariaDB 연결 확인 완료");
} finally {
  await getDatabase().destroy();
}
