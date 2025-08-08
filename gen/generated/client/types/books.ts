/* Generated. Do not edit. */
export type InsertBooks = {
  id?: string;
  author_id?: string | null;
  title: string;
};

export type UpdateBooks = Partial<InsertBooks>;

export type SelectBooks = {
  id: string;
  author_id: string | null;
  title: string;
};
