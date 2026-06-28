/**
 * Generates the filtering / WHERE-operator reference by calling postgresdk's own
 * `emitWhereTypes()` and parsing the emitted TypeScript in-memory. The operator
 * set and its JSDoc in `src/emit-where-types.ts` is the single source of truth.
 */
import { Project, Node, type PropertySignature } from "ts-morph";
import { emitWhereTypes } from "../../src/emit-where-types";
import { writeReferencePage, mdCell } from "./_shared";

const project = new Project({ useInMemoryFileSystem: true });
const sf = project.createSourceFile("where.ts", emitWhereTypes());

/** First JSDoc description line of a property. */
function doc(prop: PropertySignature): string {
  const d = prop.getJsDocs()[0];
  return d ? d.getDescription().trim() : "";
}

/** Members of a type alias whose type node is an object literal. */
function aliasMembers(name: string): PropertySignature[] {
  const node = sf.getTypeAliasOrThrow(name).getTypeNodeOrThrow();
  if (Node.isTypeLiteral(node)) return node.getMembers().filter(Node.isPropertySignature);
  // Intersection (e.g. Where<T> = A & { $or; $and }) — collect from object-literal parts.
  if (Node.isIntersectionTypeNode(node)) {
    return node
      .getTypeNodes()
      .filter(Node.isTypeLiteral)
      .flatMap((n) => n.getMembers().filter(Node.isPropertySignature));
  }
  return [];
}

function table(props: PropertySignature[]): string {
  return [
    "| Operator | Description |",
    "| --- | --- |",
    ...props.map((p) => `| \`${p.getName()}\` | ${mdCell(doc(p)) || "—"} |`),
  ].join("\n");
}

const operators = aliasMembers("WhereOperator");
const logical = aliasMembers("Where");
const jsonbPath = aliasMembers("JsonbPathQuery");

const body = `
List operations accept a type-safe \`where\` clause. A field maps either to a direct value
(equality) or to an **operator object**. Operators are validated at compile time — e.g. string-only
operators reject non-string columns, and JSONB operators are only offered on \`object\`/\`unknown\` columns.

\`\`\`ts
await sdk.users.list({
  where: {
    status: "active",                 // direct value → equality
    age: { $gte: 18, $lt: 65 },       // operator object
    name: { $ilike: "%alice%" },      // case-insensitive LIKE
    $or: [{ role: "admin" }, { role: "owner" }],
  },
});
\`\`\`

## Field operators

Use these inside an operator object on a single column.

${table(operators)}

## Logical operators

Combine field conditions. \`$or\`/\`$and\` nest up to two levels.

${table(logical)}

## JSONB path query

Shape of the \`$jsonbPath\` operator value.

${table(jsonbPath)}
`;

const path = writeReferencePage({
  slug: "filtering-operators",
  title: "Filtering & WHERE operators",
  description: "Every where-clause operator, generated from postgresdk's emitWhereTypes().",
  source: "src/emit-where-types.ts (via `emitWhereTypes()`)",
  body,
});

console.log(`✓ Operators ref   → ${path}`);
