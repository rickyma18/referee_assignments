export type GroupId = string;

export interface Group {
  id: GroupId;
  name: string;
  season: string;
  name_lc: string;
  season_lc: string;
  createdAt: number; // Date.now()
  updatedAt: number; // Date.now()
}
