import { NextResponse } from "next/server";
import { GitHubReleaseError } from "../../../../lib/releases/github";
import { collectLatestReleases } from "../../../../lib/releases/service";
import type { CollectionApiResponse } from "../../../../lib/releases/types";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse<CollectionApiResponse>> {
  try {
    const result = await collectLatestReleases();

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof GitHubReleaseError) {
      return NextResponse.json(
        { success: false, error: error.publicMessage },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Release를 저장하는 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
