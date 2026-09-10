import bcrypt from "bcrypt";

const BCRYPT_WORK_FACTOR = 12;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

function assertSupportedPassword(password: string): void {
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new Error("비밀번호는 UTF-8 기준 72 bytes 이하여야 합니다.");
  }
}

/** 비밀번호 원문을 저장하지 않도록 bcrypt hash를 생성한다. */
export async function hashPassword(password: string): Promise<string> {
  assertSupportedPassword(password);
  return bcrypt.hash(password, BCRYPT_WORK_FACTOR);
}

/** 입력한 비밀번호가 저장된 bcrypt hash와 일치하는지 확인한다. */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  assertSupportedPassword(password);
  return bcrypt.compare(password, passwordHash);
}
