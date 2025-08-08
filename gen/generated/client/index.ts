/* Generated. Do not edit. */
export { AuthorsClient } from "./authors";
export { BookTagsClient } from "./book_tags";
export { BooksClient } from "./books";
export { TagsClient } from "./tags";

export class SDK {
  public authors: AuthorsClient;
  public book_tags: BookTagsClient;
  public books: BooksClient;
  public tags: TagsClient;

  constructor(cfg: { baseUrl: string; fetch?: typeof fetch; auth?: () => Promise<Record<string,string>> }) {
    const f = cfg.fetch ?? fetch;
    this.authors = new AuthorsClient(cfg.baseUrl, f, cfg.auth);
    this.book_tags = new BookTagsClient(cfg.baseUrl, f, cfg.auth);
    this.books = new BooksClient(cfg.baseUrl, f, cfg.auth);
    this.tags = new TagsClient(cfg.baseUrl, f, cfg.auth);
  }
}
