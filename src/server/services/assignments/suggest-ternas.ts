// src/server/services/assignments/suggest-ternas.ts
"use server";
import "server-only";

export * from "./terna-types";
export { suggestTernaForMatch } from "./terna-single";
export { suggestTernasForMatchesBalanced, suggestTernasForMatchday } from "./terna-batch";
