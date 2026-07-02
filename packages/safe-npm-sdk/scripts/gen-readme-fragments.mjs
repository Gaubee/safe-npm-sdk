// Regenerate the "Endpoint coverage" table in README.md from the operation
// source files. Scans src/operations/*.ts for `export async function` names,
// groups them by file (tag), and rewrites the markdown between the
// <!-- BEGIN ENDPOINTS --> / <!-- END ENDPOINTS --> markers. Idempotent.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const opsDir = join(root, "src/operations");
const readmePath = join(root, "README.md");

const BEGIN = "<!-- BEGIN ENDPOINTS -->";
const END = "<!-- END ENDPOINTS -->";

// Readable group names per operation file (tag -> human label).
const GROUP_LABELS = {
  tokens: "Tokens",
  oidc: "OIDC",
  trust: "Trust",
  unpublish: "Unpublish",
  access: "Access",
  audit: "Audit",
  "org-team": "Org & Team",
  publish: "Publish",
  search: "Search",
  stage: "Stage",
  profile: "Profile",
  login: "Login",
};

// Order of groups in the table (deterministic, not alphabetical).
const GROUP_ORDER = [
  "tokens",
  "oidc",
  "trust",
  "unpublish",
  "access",
  "audit",
  "org-team",
  "publish",
  "search",
  "stage",
  "profile",
  "login",
];

function extractOperations(filePath) {
  const src = readFileSync(filePath, "utf8");
  const re = /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g;
  const names = [];
  let m;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

function backtickList(names) {
  return names.map((n) => `\`${n}\``).join(", ");
}

// Collect operations grouped by file basename (without extension).
const files = readdirSync(opsDir).filter((f) => f.endsWith(".ts"));
const groups = new Map();
for (const f of files) {
  const tag = f.replace(/\.ts$/, "");
  const names = extractOperations(join(opsDir, f));
  if (names.length) groups.set(tag, names);
}

// Build the table rows, ordered by GROUP_ORDER; any leftover tags appended.
const orderedTags = [
  ...GROUP_ORDER.filter((t) => groups.has(t)),
  ...[...groups.keys()].filter((t) => !GROUP_ORDER.includes(t)),
];

const lines = ["| Group | Operations |", "| --- | --- |"];
for (const tag of orderedTags) {
  const label = GROUP_LABELS[tag] ?? tag;
  lines.push(`| **${label}** | ${backtickList(groups.get(tag))} |`);
}
const fragment = lines.join("\n");

// Splice the fragment into README between the markers.
const readme = readFileSync(readmePath, "utf8");
const beginIdx = readme.indexOf(BEGIN);
const endIdx = readme.indexOf(END);
if (beginIdx === -1 || endIdx === -1) {
  console.error(`markers not found in ${readmePath}; expected ${BEGIN} / ${END}`);
  process.exit(1);
}
const updated =
  readme.slice(0, beginIdx + BEGIN.length) + "\n" + fragment + "\n" + readme.slice(endIdx);

writeFileSync(readmePath, updated);
const total = [...groups.values()].reduce((a, n) => a + n.length, 0);
console.log(
  `Updated endpoint table in README.md (${total} operations across ${orderedTags.length} groups).`,
);
