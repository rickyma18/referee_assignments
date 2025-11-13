import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

function key(s: string) {
  return s.toLowerCase().trim();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get("leagueId");
    const groupId = searchParams.get("groupId");
    if (!leagueId || !groupId) {
      return NextResponse.json({ ok: false, message: "leagueId y groupId requeridos" }, { status: 400 });
    }

    const db = getFirestore();

    const [teamsSnap, venuesSnap] = await Promise.all([
      db.collection("teams").where("groupId", "==", groupId).get(),
      db.collection("venues").where("groupId", "==", groupId).get(),
    ]);

    const teams = teamsSnap.docs.map((d) => {
      const stadiumRaw = (d.get("stadium") ?? d.get("venue") ?? "").toString();
      const logoUrl = (d.get("logoUrl") ?? d.get("logo") ?? "").toString();
      return {
        id: d.id,
        name: String(d.get("name") ?? ""),
        logoUrl: logoUrl.trim() ?? undefined, // <- para preview VS
        stadium: stadiumRaw.trim(),
      };
    });

    // Venues reales
    const venuesReal = venuesSnap.docs.map((d) => ({
      id: d.id,
      name: String(d.get("name") ?? ""),
    }));

    // Intento de defaultVenueId por nombre (solo si existe venue real)
    const mapByName = new Map(venuesReal.map((v) => [key(v.name), v]));
    const teamsWithDefaults = teams.map((t) => {
      const v = t.stadium ? mapByName.get(key(t.stadium)) : undefined;
      return v ? { ...t, defaultVenueId: v.id, defaultVenueName: v.name } : t;
    });

    // Venues derivados desde teams.stadium
    const seen = new Set(venuesReal.map((v) => key(v.name)));
    const venuesDerived: { id: string; name: string }[] = [];
    for (const t of teams) {
      if (!t.stadium) continue;
      const k = key(t.stadium);
      if (seen.has(k)) continue;
      seen.add(k);
      venuesDerived.push({ id: `team-derived:${k}`, name: t.stadium });
    }

    const venuesMerged = [...venuesReal, ...venuesDerived];

    // Ordenar alfabéticamente (ES)
    const collator = new Intl.Collator("es", {
      sensitivity: "base",
      ignorePunctuation: true,
      numeric: true,
    });

    const teamsSorted = teamsWithDefaults.sort((a, b) => collator.compare(a.name ?? "", b.name ?? ""));
    const venuesSorted = venuesMerged.sort((a, b) => collator.compare(a.name ?? "", b.name ?? ""));

    return NextResponse.json({
      ok: true,
      teams: teamsSorted,
      venues: venuesSorted,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Error interno" }, { status: 500 });
  }
}
