// Converts the embedded OpenAPI spec (openapi.json) into api-docs.npmjs.com.md
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));

const md = [];

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// ----- helpers -----
function refName(ref) {
  return typeof ref === "string" ? ref.split("/").pop() : undefined;
}

function resolveSchema(node) {
  if (!node) return {};
  if (node.$ref) {
    const name = refName(node.$ref);
    return spec.components?.schemas?.[name] ?? {};
  }
  return node;
}

// Resolve a $ref that may point at components/parameters, components/schemas, etc.
function resolveRef(obj) {
  if (!obj || !obj.$ref) return obj;
  const parts = obj.$ref.split("/").slice(1); // drop leading '#'
  let cur = spec;
  for (const p of parts) cur = cur?.[p];
  return cur ?? obj;
}

// A single-line, HTML-entity-free type signature for a schema node.
// Used inside table cells. Keeps it short — nested field details are
// rendered by separate rows, not inlined here.
function typeName(node) {
  if (!node) return "any";
  // Named $ref → use the component name as the type.
  if (node.$ref) return refName(node.$ref);
  node = resolveSchema(node);
  // composite (oneOf/anyOf) → union of branch type names
  const union = node.oneOf || node.anyOf;
  if (union) {
    const parts = union.map((s) => {
      const r = resolveSchema(s);
      if (r.enum) return `${r.type || "string"}(${r.enum.map((x) => JSON.stringify(x)).join("|")})`;
      return typeName(r);
    });
    return parts.join(" | ");
  }
  if (node.allOf) return node.allOf.map((s) => typeName(resolveSchema(s))).join(" & ");
  if (node.enum) return `${node.type || "string"} enum [${node.enum.map((x) => `\`${JSON.stringify(x)}\``).join(", ")}]`;
  if (node.type === "array" || node.items) return `${typeName(node.items)}[]`;
  if (node.properties) return "object";
  if (node.format) return `${node.type} (${node.format})`;
  return node.type || "any";
}

// Human-readable type for a FIELD cell in the table.
// Handles scalars, enums, enum-arrays, object-arrays, unions, and named refs,
// collapsing nested structure into a compact single-line description.
function fieldType(node) {
  if (!node) return "any";
  if (node.$ref) return refName(node.$ref);
  node = resolveSchema(node);

  // array → describe the element type and append []
  if (node.type === "array" || node.items) {
    const it = resolveSchema(node.items);
    if (it.enum) {
      return `${it.type || "string"} enum [${it.enum.map((x) => `\`${JSON.stringify(x)}\``).join(", ")}]`;
    }
    if (it.properties) return "object[]";
    if (it.oneOf || it.anyOf) return `${typeName(it)}[]`;
    return `${typeName(it)}[]`;
  }
  // scalar enum
  if (node.enum) {
    return `${node.type || "string"} enum [${node.enum.map((x) => `\`${JSON.stringify(x)}\``).join(", ")}]`;
  }
  // union (oneOf/anyOf) at field level
  if (node.oneOf || node.anyOf) return typeName(node);
  // object with no further scalar info
  if (node.properties) return "object";
  return typeName(node);
}

// A compact inline enum label, e.g.  string enum: `"a"`, `"b"`
// (kept for reference; fieldType now handles enums uniformly)
// Recursively collect field rows from a schema.
// Returns an array of { field, type, required, desc, subheader }.
// - `subheader` (optional) marks a oneOf-variant separator row.
function collectRows(node, prefix = "", requiredList = []) {
  const out = [];
  node = resolveSchema(node);

  // Top-level or nested array-of-objects: unwrap the item schema.
  if ((node.type === "array" || node.items) && !prefix) {
    return collectRows(node.items, "", []);
  }

  // composite at this level: render each variant under a subheader
  const union = node.oneOf || node.anyOf;
  if (union) {
    union.forEach((branch, i) => {
      const isRef = !!branch.$ref;
      const b = resolveSchema(branch);
      let label;
      // pick the most descriptive variant label available
      if (b.properties?.type?.enum?.length) {
        label = `when type = ${b.properties.type.enum.join(" | ")}`;
      } else if (isRef) {
        label = `as ${refName(branch.$ref)}`;
      } else if (b.title) {
        label = b.title;
      } else {
        const firstDesc = (b.description || "").split(/[.\n]/)[0].trim();
        label = firstDesc ? `variant: ${firstDesc}` : `variant ${i + 1}`;
      }
      out.push({ subheader: label });
      out.push(...collectRows(b, prefix, b.required || []));
    });
    return out;
  }

  const props = node.properties || {};
  const req = requiredList || node.required || [];
  for (const [key, valRaw] of Object.entries(props)) {
    const v = resolveSchema(valRaw);
    const field = prefix ? `${prefix}.${key}` : key;
    const isReq = req.includes(key);
    const type = fieldType(v);

    let desc = (v.description || "").replace(/\s+/g, " ").trim();
    if (v.default !== undefined) desc += ` Default: \`${JSON.stringify(v.default)}\`.`;
    if (v.example !== undefined) desc += ` Example: \`${JSON.stringify(v.example)}\`.`;
    out.push({ field, type, required: isReq, desc });

    // Recurse into nested object fields to show their sub-fields.
    if (v.properties) {
      out.push(...collectRows(v, field, v.required || []));
    }
    // Array of objects → show sub-fields under `field[]`.
    if ((v.type === "array" || v.items) && resolveSchema(v.items).properties) {
      out.push(...collectRows(resolveSchema(v.items), `${field}[]`, resolveSchema(v.items).required || []));
    }
  }
  return out;
}

// Escape a pipe so it doesn't break the markdown table cell.
function escCell(s) {
  return String(s).replace(/(?<!\\)\|/g, "\\|");
}

// Render collected rows as markdown table lines (with subheader rows for variants).
function renderRowsTable(rows) {
  const lines = ["| Field | Type | Required | Description |", "| --- | --- | --- | --- |"];
  for (const r of rows) {
    if (r.subheader) {
      // a separator spanning row describing a oneOf variant
      lines.push("| **" + escCell(r.subheader) + "** | | | |");
      continue;
    }
    const field = "`" + r.field + "`";
    lines.push("| " + field + " | " + escCell(r.type) + " | " + (r.required ? "Yes" : "No") + " | " + escCell(r.desc) + " |");
  }
  return lines;
}

// Flatten nested field paths like `a.b[].c` into indented pseudo-paths for readability.
// (Kept simple: callers pass already-dotted field names from collectRows.)


function responseExample(op) {
  // Prefer x-examples / examples in success responses
  for (const code of ["200", "201", "202", "204", "default"]) {
    const r = op.responses?.[code];
    if (!r) continue;
    for (const mt of ["application/json", "application/vnd.npm.install-v1+json"]) {
      const content = r.content?.[mt];
      if (content?.example) {
        return { code, mediaType: mt, body: content.example };
      }
    }
  }
  return null;
}

// ----- document header -----
md.push(`# ${spec.info.title}`);
md.push("");
md.push(`> Version: \`${spec.info.version}\` · OpenAPI \`${spec.openapi}\``);
if (spec.info.license) md.push(`> License: [${spec.info.license.name}](${spec.info.license.url})`);
md.push("");
if (spec.info.description) {
  md.push(spec.info.description);
  md.push("");
}
md.push(`- **Base URL:** \`${spec.servers.map((s) => s.url).join("` / `")}\``);
md.push(`- **Transport:** HTTPS · request/response bodies are JSON (some publish endpoints use multipart/form-data)`);
md.push("");

// ----- table of contents / endpoints overview -----
md.push("## Endpoints Overview");
md.push("");
const tagOrder = (spec.tags || []).map((t) => t.name);
// collect tags actually used
const usedTags = new Set();
for (const item of Object.values(spec.paths)) {
  for (const m of METHODS) {
    if (item[m]?.tags) item[m].tags.forEach((t) => usedTags.add(t));
  }
}
const orderedTags = [...tagOrder.filter((t) => usedTags.has(t)), ...[...usedTags].filter((t) => !tagOrder.includes(t))];

for (const tag of orderedTags) {
  const tagDef = (spec.tags || []).find((t) => t.name === tag);
  md.push(`### ${tag}`);
  md.push("");
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op || !(op.tags || []).includes(tag)) continue;
      const depr = op.deprecated ? " ⚠️ _deprecated_" : "";
      md.push(`- \`${m.toUpperCase()}\` \`${path}\` — ${op.summary || op.operationId || ""}${depr}`);
    }
  }
  md.push("");
}

// ----- Authentication -----
const authTag = (spec.tags || []).find((t) => t.name === "Authentication");
if (authTag?.description) {
  md.push("## Authentication");
  md.push("");
  md.push(authTag.description);
  md.push("");
  md.push("### Security Schemes");
  md.push("");
  md.push("| Scheme | Type | Description |");
  md.push("| --- | --- | --- |");
  for (const [name, scheme] of Object.entries(spec.components?.securitySchemes || {})) {
    md.push(
      `| \`${name}\` | ${scheme.type} (${scheme.scheme}${scheme.bearerFormat ? ", " + scheme.bearerFormat : ""}) | ${(scheme.description || "").replace(/\n+/g, " ")} |`
    );
  }
  md.push("");
}

// ----- Per-tag endpoint details -----
md.push("## Endpoint Reference");
md.push("");
for (const tag of orderedTags) {
  const tagDef = (spec.tags || []).find((t) => t.name === tag);
  md.push(`### ${tag}`);
  md.push("");
  if (tagDef?.description && tagDef.name !== "Authentication") {
    md.push(tagDef.description);
    md.push("");
  }
  let wroteAny = false;
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op || !(op.tags || []).includes(tag)) continue;
      wroteAny = true;
      md.push(`#### \`${m.toUpperCase()}\` \`${path}\``);
      md.push("");
      const parts = [];
      if (op.operationId) parts.push(`**Operation ID:** \`${op.operationId}\``);
      if (op.deprecated) parts.push("⚠️ **Deprecated**");
      if (parts.length) {
        md.push(parts.join(" · "));
        md.push("");
      }
      if (op.summary) {
        md.push(`> ${op.summary}`);
        md.push("");
      }
      if (op.description) {
        md.push(op.description);
        md.push("");
      }
      // security
      const sec = op.security ?? spec.security;
      if (sec && sec.length) {
        const names = sec
          .map((s) => Object.keys(s))
          .flat()
          .map((s) => `\`${s}\``)
          .join(", ");
        md.push(`**Auth:** ${names || "_none_"}`);
        md.push("");
      }
      // parameters
      const params = [...(item.parameters || []), ...(op.parameters || [])].map(resolveRef);
      if (params.length) {
        md.push("##### Parameters");
        md.push("");
        md.push("| Name | In | Type | Required | Description |");
        md.push("| --- | --- | --- | --- | --- |");
        for (const p of params) {
          const s = resolveSchema(p.schema);
          let type = s.type || "";
          if (s.format) type += ` (${s.format})`;
          if (s.enum) type += ` enum: ${s.enum.map((x) => `\`${JSON.stringify(x)}\``).join(",")}`;
          const desc = (p.description || "").replace(/\n+/g, " ").trim();
          md.push(`| \`${p.name}\` | ${p.in} | ${type} | ${p.required ? "Yes" : "No"} | ${desc} |`);
        }
        md.push("");
      }
      // request body
      if (op.requestBody) {
        md.push("##### Request Body");
        md.push("");
        if (op.requestBody.description) {
          md.push(op.requestBody.description);
          md.push("");
        }
        const mtypes = Object.keys(op.requestBody.content || {});
        for (const mt of mtypes) {
          const c = op.requestBody.content[mt];
          md.push(`**Content-Type:** \`${mt}\`${op.requestBody.required ? " *(required)*" : ""}`);
          md.push("");
          const schema = resolveSchema(c.schema);
          const rows = collectRows(schema);
          if (rows.length) {
            md.push(renderRowsTable(rows).join("\n"));
            md.push("");
          } else {
            md.push(`Type: \`${typeName(schema)}\``);
            md.push("");
          }
          if (c.example) {
            md.push("Example:");
            md.push("");
            md.push("```json");
            md.push(JSON.stringify(c.example, null, 2));
            md.push("```");
            md.push("");
          }
        }
      }
      // responses
      md.push("##### Responses");
      md.push("");
      for (const [code, r] of Object.entries(op.responses || {})) {
        md.push(`**\`${code}\`** ${r.description || ""}`);
        md.push("");
        const mtypes = Object.keys(r.content || {});
        for (const mt of mtypes) {
          const c = r.content[mt];
          md.push(`- Content-Type: \`${mt}\``);
          const schema = resolveSchema(c.schema);
          const rows = collectRows(schema);
          if (rows.length) {
            md.push("");
            for (const line of renderRowsTable(rows)) md.push("  " + line);
            md.push("");
          } else if (schema) {
            md.push(`  - Type: \`${typeName(schema)}\``);
          }
          if (c.example) {
            md.push("");
            md.push("  Example:");
            md.push("");
            md.push("  ```json");
            md.push(JSON.stringify(c.example, null, 2).split("\n").map((l) => "  " + l).join("\n"));
            md.push("  ```");
          }
        }
      }
      md.push("");
      md.push("---");
      md.push("");
    }
  }
  if (!wroteAny) md.push("_No operations._\n");
}

// ----- Schemas reference -----
md.push("## Schemas");
md.push("");
for (const [name, schema] of Object.entries(spec.components?.schemas || {})) {
  md.push(`### \`${name}\``);
  md.push("");
  if (schema.description) {
    md.push(schema.description);
    md.push("");
  }
  const rows = collectRows(schema);
  if (rows.length) {
    md.push(renderRowsTable(rows).join("\n"));
    md.push("");
  } else {
    md.push(`Type: \`${typeName(schema)}\``);
    md.push("");
  }
}

fs.writeFileSync(new URL("../api-docs.npmjs.com.md", import.meta.url), md.join("\n"));
console.log("Wrote api-docs.npmjs.com.md", md.join("\n").length, "chars");
