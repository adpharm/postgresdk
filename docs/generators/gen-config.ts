/**
 * Generates the configuration reference from `src/types.ts` using ts-morph.
 * The `Config` interface (and friends) — including JSDoc descriptions and
 * `@default` tags — is the single source of truth.
 */
import { resolve } from "node:path";
import { Project, Node, type PropertySignature, type TypeNode } from "ts-morph";
import { SRC, writeReferencePage, mdCell, typeCell } from "./_shared";

const project = new Project({ skipAddingFilesFromTsConfig: true });
const sf = project.addSourceFileAtPath(resolve(SRC, "types.ts"));

interface Row {
  name: string;
  optional: boolean;
  type: string;
  def: string;
  desc: string;
}

/** A documented object: a heading + its rows, plus any nested objects to render after. */
interface Section {
  heading: string;
  intro?: string;
  rows: Row[];
}

/** Pull JSDoc description + `@default` tag from a property. */
function readDoc(prop: PropertySignature): { desc: string; def: string } {
  let desc = "";
  let def = "";
  for (const d of prop.getJsDocs()) {
    const dd = d.getDescription().trim();
    if (dd) desc += (desc ? " " : "") + dd;
    for (const tag of d.getTags()) {
      if (tag.getTagName() === "default") def = (tag.getCommentText() ?? "").trim();
    }
  }
  return { desc, def };
}

/** If a type node is an inline object (or Array<inline object>), return its properties. */
function inlineObjectProps(typeNode: TypeNode | undefined): PropertySignature[] | null {
  if (!typeNode) return null;
  if (Node.isTypeLiteral(typeNode)) {
    return typeNode.getMembers().filter(Node.isPropertySignature);
  }
  let element: TypeNode | undefined;
  if (Node.isArrayTypeNode(typeNode)) element = typeNode.getElementTypeNode();
  else if (Node.isTypeReference(typeNode) && typeNode.getTypeName().getText() === "Array") {
    element = typeNode.getTypeArguments()[0];
  }
  if (element && Node.isTypeLiteral(element)) {
    return element.getMembers().filter(Node.isPropertySignature);
  }
  return null;
}

const sections: Section[] = [];

/** Render an object's properties into a section, recursing into nested inline objects. */
function renderObject(heading: string, props: PropertySignature[], intro?: string) {
  const rows: Row[] = [];
  const nested: Array<{ heading: string; props: PropertySignature[] }> = [];

  for (const prop of props) {
    const name = prop.getName();
    const typeNode = prop.getTypeNode();
    const { desc, def } = readDoc(prop);
    const children = inlineObjectProps(typeNode);
    const typeText = children ? "object — see below" : typeNode?.getText() ?? "unknown";
    rows.push({ name, optional: prop.hasQuestionToken(), type: typeText, def, desc });
    if (children) nested.push({ heading: `${heading}.${name}`, props: children });
  }

  sections.push({ heading, intro, rows });
  for (const n of nested) renderObject(n.heading, n.props);
}

// Top-level Config + the standalone config interfaces it references.
renderObject(
  "Config",
  sf.getInterfaceOrThrow("Config").getProperties(),
  "The default export of your `postgresdk.config.ts`. Only `connectionString` is required.",
);
renderObject(
  "DeleteConfig",
  sf.getInterfaceOrThrow("DeleteConfig").getProperties(),
  "Shape of `Config.delete`.",
);
renderObject(
  "AuthConfig",
  sf.getInterfaceOrThrow("AuthConfig").getProperties(),
  "Full shape of `Config.auth`. An API-key shorthand (`{ apiKey: \"...\" }`) is also accepted and normalized to this.",
);
renderObject(
  "PullConfig",
  sf.getInterfaceOrThrow("PullConfig").getProperties(),
  "Shape of `Config.pull`, used by client repos that pull a generated SDK over HTTP.",
);

function renderSection(s: Section): string {
  const lines: string[] = [`## \`${s.heading}\``];
  if (s.intro) lines.push("", s.intro);
  lines.push(
    "",
    "| Option | Type | Default | Description |",
    "| --- | --- | --- | --- |",
  );
  for (const r of s.rows) {
    const name = "`" + r.name + (r.optional ? "?" : "") + "`";
    lines.push(
      `| ${name} | ${typeCell(r.type)} | ${r.def ? typeCell(r.def) : "—"} | ${mdCell(r.desc) || "—"} |`,
    );
  }
  return lines.join("\n");
}

const body = `
postgresdk reads a \`postgresdk.config.ts\` that default-exports a [\`Config\`](#config) object.
Use \`postgresdk init\` to scaffold one.

\`\`\`ts
import type { Config } from "postgresdk";

export default {
  connectionString: process.env.DATABASE_URL!,
  outDir: { client: "./api/client", server: "./api/server" },
} satisfies Config;
\`\`\`

${sections.map(renderSection).join("\n\n")}
`;

const path = writeReferencePage({
  slug: "configuration",
  title: "Configuration reference",
  description: "Every postgresdk.config.ts option, generated from the Config type.",
  source: "src/types.ts",
  body,
});

console.log(`✓ Config reference → ${path}`);
