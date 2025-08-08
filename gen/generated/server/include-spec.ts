// Generated. Do not edit.

export type AuthorsIncludeSpec = {
  books?: true | { include?: BooksIncludeSpec };
}

export type BookTagsIncludeSpec = {
  book?: true | { include?: BooksIncludeSpec };
  tag?: true | { include?: TagsIncludeSpec };
}

export type BooksIncludeSpec = {
  book_tags?: true | { include?: BookTagsIncludeSpec };
  author?: true | { include?: AuthorsIncludeSpec };
  tags?: true | { include?: TagsIncludeSpec };
}

export type TagsIncludeSpec = {
  book_tags?: true | { include?: BookTagsIncludeSpec };
  books?: true | { include?: BooksIncludeSpec };
}

