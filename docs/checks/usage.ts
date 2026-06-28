/**
 * Compile-only usage check for the documented SDK surface.
 *
 * Every call/option here mirrors a pattern shown in the docs guides. It is
 * typechecked (never executed) against an SDK generated from test/schema.sql by
 * `task docs:check`. If postgresdk's client API drifts — a method/param renamed
 * or a return type changed — this stops compiling and the check fails, flagging
 * that the prose guides need updating.
 *
 * Imports resolve to ../.generated/client at check time (see check-usage.ts).
 */
import { SDK } from "./client";
import type { SelectAuthors } from "./client/types/authors";
import type { PaginatedResponse } from "./client/types/shared";

const sdk = new SDK({ baseUrl: "http://localhost:3000", auth: { apiKey: "k" } });

// Assert the documented shared types are importable.
type _PaginatedImport = PaginatedResponse<SelectAuthors>;

// CRUD — getByPk/update return null when absent (client-usage.md)
async function crud() {
  const a = await sdk.authors.create({ name: "Alice" });
  const _id: string = a.id;
  void _id;
  const one = await sdk.authors.getByPk(a.id);
  if (one) {
    const _name: string = one.name; // narrows away null
    void _name;
  }
  void (await sdk.authors.update(a.id, { name: "Alice 2" }));
  await sdk.authors.hardDelete(a.id);

  void (await sdk.users.upsert({
    where: { email: "x@y.com" },
    create: { email: "x@y.com" },
    update: { email: "x@y.com" },
  }));
}

// Querying — where/sort/select/exclude/distinctOn/pagination (querying.md)
async function listing() {
  const res = await sdk.authors.list({
    where: { name: { $ilike: "%a%" }, $or: [{ name: "x" }, { name: "y" }] },
    orderBy: ["name"],
    order: ["asc"],
    limit: 10,
    offset: 0,
    distinctOn: "name",
  });
  const _total: number = res.total;
  const _more: boolean = res.hasMore;
  void _total;
  void _more;
  void res.data;

  await sdk.authors.list({ select: ["id", "name"] });
  await sdk.authors.list({ exclude: ["name"] });
}

// Includes — generic + typed convenience methods (client-usage.md)
async function includes() {
  const r = await sdk.authors.list({ include: { books: true } });
  void r.data;
  await sdk.authors.listWithBooks({ limit: 5, booksInclude: { orderBy: "title", limit: 3 } });
  void (await sdk.authors.getByPkWithBooks("id", { booksInclude: { limit: 3 } }));
}

// Vector + trigram search (querying.md)
async function search() {
  await sdk.video_sections.list({
    vector: { field: "vision_embedding", query: [0, 0, 0], metric: "cosine", maxDistance: 0.5 },
    limit: 5,
  });
  await sdk.websites.list({
    trigram: { field: "name", query: "exmpl", metric: "similarity", threshold: 0.3 },
  });
  await sdk.websites.list({
    trigram: { fields: ["name", "url"], strategy: "greatest", query: "exmpl" },
  });
}

// Transactions — lazy builders + .failedAt/.issues on error (client-usage.md)
async function tx() {
  try {
    void (await sdk.$transaction([
      sdk.authors.$create({ name: "A" }),
      sdk.authors.$update("id", { name: "B" }),
    ]));
  } catch (err: any) {
    void err.failedAt;
    void err.issues;
  }
}

void [crud, listing, includes, search, tx];
