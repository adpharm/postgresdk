/* Generated. Do not edit. */
export type AuthorsIncludeSpec = {
  books?: boolean | { include?: BooksIncludeSpec; limit?: number; offset?: number; };
};

export type BookTagsIncludeSpec = {
  book?: boolean | BooksIncludeSpec;
  tag?: boolean | TagsIncludeSpec;
};

export type BooksIncludeSpec = {
  book_tags?: boolean | { include?: BookTagsIncludeSpec; limit?: number; offset?: number; };
  author?: boolean | AuthorsIncludeSpec;
  tags?: boolean | { include?: TagsIncludeSpec; limit?: number; offset?: number; };
};

export type TagsIncludeSpec = {
  book_tags?: boolean | { include?: BookTagsIncludeSpec; limit?: number; offset?: number; };
  books?: boolean | { include?: BooksIncludeSpec; limit?: number; offset?: number; };
};

