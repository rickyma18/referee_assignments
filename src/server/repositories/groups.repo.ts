"use server";

import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import type { Group } from "@/domain/groups/group.types";
import { norm } from "@/domain/groups/group.normalizers";

const COL = "groups";

export type GetAllParams = {
  search?: string;
  season?: string;
  pageSize?: number;
  cursorId?: string;
};

export async function getById(id: string) {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Group) : null;
}

export async function existsByNameAndSeason(name: string, season: string): Promise<boolean> {
  const name_lc = norm(name);
  const season_lc = norm(season);
  const q = query(collection(db, COL), where("name_lc", "==", name_lc), where("season_lc", "==", season_lc), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function getAll(params: GetAllParams = {}) {
  const { search, season, pageSize = 20, cursorId } = params;
  const qRef: any = collection(db, COL);

  const filters: any[] = [];
  if (season) filters.push(where("season_lc", "==", norm(season)));

  let qBase = query(qRef, orderBy("season_lc", "asc"), orderBy("name_lc", "asc"), limit(pageSize));

  if (cursorId) {
    const last = await getDoc(doc(db, COL, cursorId));
    if (last.exists()) {
      qBase = query(qRef, orderBy("season_lc", "asc"), orderBy("name_lc", "asc"), startAfter(last), limit(pageSize));
    }
  }

  if (filters.length) qBase = query(qBase, ...filters);

  const snap = await getDocs(qBase);
  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Group[];

  if (search?.trim()) {
    const s = norm(search);
    items = items.filter((g) => g.name_lc.includes(s));
  }

  const nextCursorId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : undefined;

  return { items, nextCursorId };
}

export async function create(data: { name: string; season: string }) {
  const name_lc = norm(data.name);
  const season_lc = norm(data.season);

  if (await existsByNameAndSeason(data.name, data.season)) {
    throw new Error("Ya existe un grupo con ese nombre en esa temporada.");
  }

  const docRef = await addDoc(collection(db, COL), {
    name: data.name,
    season: data.season,
    name_lc,
    season_lc,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { id: docRef.id };
}

export async function update(id: string, data: { name: string; season: string }) {
  const name_lc = norm(data.name);
  const season_lc = norm(data.season);

  if (await existsByNameAndSeason(data.name, data.season)) {
    const q = query(
      collection(db, COL),
      where("name_lc", "==", name_lc),
      where("season_lc", "==", season_lc),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty && snap.docs[0].id !== id) {
      throw new Error("Ya existe un grupo con ese nombre en esa temporada.");
    }
  }

  await updateDoc(doc(db, COL, id), {
    name: data.name,
    season: data.season,
    name_lc,
    season_lc,
    updatedAt: Date.now(),
  });

  return { id };
}

export async function remove(id: string) {
  await deleteDoc(doc(db, COL, id));
  return { id };
}
