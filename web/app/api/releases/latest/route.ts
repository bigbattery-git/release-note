import { NextResponse } from "next/server";
import { getLatestTechnologyReleases } from "../../../../lib/releases/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const technologies = await getLatestTechnologyReleases();

    return NextResponse.json(
      { data: technologies },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "최신 Release를 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
