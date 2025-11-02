export type LeagueStatus = "ACTIVE" | "ARCHIVED";

export interface League {
  id: string;
  name: string;
  season: string;
  color: string; // #RRGGBB
  slug: string;
  status: LeagueStatus;
  region?: string;
  startDate?: Date;
  endDate?: Date;
  logoUrl?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
