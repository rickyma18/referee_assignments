import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;

  return NextResponse.json({ ok: true, leagueId, scope: "groups" }, { status: 200 });
}
