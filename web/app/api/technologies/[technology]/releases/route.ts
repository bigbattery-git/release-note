import { NextRequest, NextResponse } from "next/server";
import {
  getTechnologyReleasePage,
  parseReleasePage,
} from "../../../../../lib/releases/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TechnologyReleaseRouteContext {
  params: Promise<{ technology: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: TechnologyReleaseRouteContext,
) {
  const pageValues = request.nextUrl.searchParams.getAll("page");
  const page = parseReleasePage(
    pageValues.length === 0
      ? undefined
      : pageValues.length === 1
        ? pageValues[0]
        : pageValues,
  );

  if (page === null) {
    return NextResponse.json(
      { error: "page는 양의 정수여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const { technology } = await params;
    const releasePage = await getTechnologyReleasePage(technology, page);

    if (!releasePage) {
      return NextResponse.json(
        { error: "요청한 technology를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { data: releasePage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Release 이력을 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
