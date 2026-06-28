// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import vercel from "@astrojs/vercel";
import starlightLlmsTxt from "starlight-llms-txt";

const SITE = "https://docs.postgresdk.com";

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Static output. The Vercel adapter emits to .vercel/output/static.
  adapter: vercel(),
  integrations: [
    starlight({
      title: "postgresdk",
      description:
        "Generate a typed server/client SDK from a Postgres schema (includes, Zod, Hono).",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/adpharm/postgresdk",
        },
      ],
      // The llms-txt plugin emits /llms.txt, /llms-full.txt, and /llms-small.txt
      // at build time so downstream agents can read the docs verbatim.
      plugins: [
        starlightLlmsTxt({
          projectName: "postgresdk",
          description:
            "postgresdk is a CLI + library that introspects a PostgreSQL schema and generates a fully typed Hono API server and TypeScript client SDK — with eager-loading includes, Zod validation, transactions, pgvector/pg_trgm search, soft-delete, and API-key/JWT auth.",
          // Order the full/small bundles so the most load-bearing docs come first.
          promote: ["index", "getting-started/**", "guides/**"],
          demote: ["reference/generated-api-example"],
          // Keep the small bundle focused: drop the long generated-output dump.
          exclude: ["reference/generated-api-example"],
        }),
      ],
      sidebar: [
        {
          label: "Start here",
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Reference (generated)",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
