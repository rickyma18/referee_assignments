export async function GET(_req: Request, ctx: { params: { leagueId: string } }) {
  return new Response(JSON.stringify({ ok: true, leagueId: ctx.params.leagueId, scope: "groups" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
