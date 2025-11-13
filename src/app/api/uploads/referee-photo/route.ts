import { NextResponse } from "next/server";

import { getStorage } from "firebase-admin/storage";
import { v4 as uuid } from "uuid";
import "@/server/admin/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, message: "Archivo requerido" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const bucket = getStorage().bucket(); // usa tu bucket por defecto
    const id = uuid();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `referees/${id}.${ext}`;

    const fileRef = bucket.file(path);
    await fileRef.save(buffer, {
      contentType: file.type || "image/jpeg",
      metadata: { cacheControl: "public, max-age=31536000" },
      resumable: false,
    });

    // Haz público o genera signed URL, según tu política
    await fileRef.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${path}`;

    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
