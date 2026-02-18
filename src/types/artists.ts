export interface Artist {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  instagram_handle?: string | null;
  image?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventArtist {
  id: string;
  event_id: string;
  artist_id: string;
  sort_order: number;
  org_id: string;
  /** Joined artist data (populated when fetched with join) */
  artist?: Artist;
}
