// src/lib/firestore-converters.ts
import type { FirestoreDataConverter, QueryDocumentSnapshot } from "firebase/firestore";

import type { UserDoc } from "@/types/user";

export const userConverter: FirestoreDataConverter<UserDoc> = {
  toFirestore(user: UserDoc) {
    return user;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot) {
    const data = snapshot.data() as UserDoc;
    return { ...data };
  },
};
