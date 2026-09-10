import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

const sessionPassword = process.env.SESSION_PASSWORD;

export interface SessionData {
  userId?: string;
}

if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error("SESSION_PASSWORD는 32자 이상이어야 합니다.");
}

/** 서버에서 사용할 암호화 cookie session의 공통 설정이다. */
export const sessionOptions = {
  cookieName: "news-summary-session",
  password: sessionPassword,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
} satisfies SessionOptions;

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}