/** Plain tag types, safe to import from client components (no server-only deps). */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface TagWithCount extends Tag {
  contactCount: number;
}
