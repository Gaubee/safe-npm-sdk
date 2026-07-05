// One-command release helper for safe-npm-sdk.
//
// Bumps the version in packages/safe-npm-sdk/package.json, refreshes the
// generated README fragments, commits, and tags — ready to push, which then
// triggers .github/workflows/release.yml to publish to npm.
//
// Usage:
//   pnpm release                  # interactive (TTY): prompts for a bump
//   pnpm release -- patch         # non-interactive: patch | minor | major | <x.y.z>
//   pnpm release -- minor --dry-run
//   pnpm release -- --help
//
// The package.json `version` field is the source of truth (the release
// workflow refuses to publish if the pushed tag disagrees with it).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "packages/safe-npm-sdk/package.json");

const BUMPS = ["patch", "minor", "major"];

// --- arg parsing ------------------------------------------------------------

function parseArgs(argv) {
  const flags = { dryRun: false, help: false };
  const positional = [];
  // A literal `--` (used by pnpm/npm to forward args) is consumed and dropped,
  // so both `pnpm release -- minor` and `node release.mjs -- minor` work.
  let sawSeparator = false;
  for (const arg of argv) {
    if (!sawSeparator && arg === "--") {
      sawSeparator = true;
      continue;
    }
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

const USAGE = `\
Usage:
  pnpm release                  Interactive: choose patch / minor / major / specific
  pnpm release -- <bump>        Non-interactive: <bump> is patch | minor | major | x.y.z
  pnpm release -- <bump> --dry-run

Flags:
  --dry-run   Print what would happen; write, commit, and tag nothing.
  --help, -h  Show this help.

Examples:
  pnpm release -- minor
  pnpm release -- 1.4.0 --dry-run`;

// --- helpers ----------------------------------------------------------------

function readPkg() {
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function git(args, { capture = false, check = true } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (check && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return capture ? result.stdout.trim() : "";
}

function workingTreeIsClean() {
  const status = git(["status", "--porcelain"], { capture: true });
  return status === "";
}

function tagExists(version) {
  const result = spawnSync("git", ["tag", "-l", `v${version}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return result.stdout.trim() !== "";
}

function bumpVersion(current, bump) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump)) return bump; // explicit x.y.z
  if (!BUMPS.includes(bump)) {
    throw new Error(`Invalid bump "${bump}". Expected patch | minor | major | x.y.z`);
  }
  const [major, minor, patch] = current.split(/[.-]/).map((n) => parseInt(n, 10));
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    throw new Error(`Could not parse current version "${current}"`);
  }
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error("unreachable");
  }
}

/** Suggest a bump from conventional commits since the last tag. Hint only. */
function suggestBump() {
  let lastTag;
  try {
    lastTag = git(["describe", "--tags", "--abbrev=0"], { capture: true, check: false });
  } catch {
    lastTag = "";
  }
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  const log = git(["log", "--format=%s", range], { capture: true, check: false });
  if (!log) return null;
  const subjects = log.split("\n").filter(Boolean);
  if (subjects.some((s) => /^feat(\(.+\))?!:/.test(s) || s.startsWith("feat!")))
    return "minor (breaking)";
  if (subjects.some((s) => /^feat(\(|:)/.test(s))) return "minor";
  return "patch";
}

async function promptBump(current) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const suggestion = suggestBump();
    const hint = suggestion ? ` (conventional commits suggest: ${suggestion})` : "";
    console.log(`Current version: ${current}${hint}\n`);
    const answer = (
      await rl.question(`Bump type? [patch/minor/major/specific x.y.z] (default: patch) `)
    ).trim();
    return answer || "patch";
  } finally {
    rl.close();
  }
}

// --- main -------------------------------------------------------------------

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  const pkg = readPkg();
  const current = pkg.version;
  let bump = positional[0];

  if (!bump) {
    if (!stdin.isTTY) {
      console.error(USAGE);
      console.error("\nError: no bump given and stdin is not a TTY (pass one explicitly).");
      process.exit(1);
    }
    bump = await promptBump(current);
  }

  const next = bumpVersion(current, bump);
  console.log(`\n${current} → ${next}${flags.dryRun ? "  (dry-run)" : ""}\n`);

  // Pre-flight: refuse on dirty tree or pre-existing tag.
  if (!workingTreeIsClean()) {
    console.error("Error: working tree is not clean. Commit or stash your changes first.");
    console.error(`  ${git(["status", "--porcelain"], { capture: true }) || "(no changes shown)"}`);
    process.exit(1);
  }
  if (tagExists(next)) {
    console.error(`Error: tag v${next} already exists.`);
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log("Dry run — would:");
    console.log(`  - write version "${next}" to packages/safe-npm-sdk/package.json`);
    console.log("  - run: vp run --filter safe-npm-sdk gen:readme");
    console.log(`  - git commit -m "chore(release): safe-npm-sdk@${next}"`);
    console.log(`  - git tag v${next}`);
    console.log(`  - then: git push && git push --tags  (triggers release.yml)`);
    return;
  }

  // 1. Write the bumped version (preserving formatting — only the line changes).
  pkg.version = next;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`✓ wrote packages/safe-npm-sdk/package.json`);

  // 2. Refresh README fragments (endpoint table etc.) — ignore failures.
  const regen = spawnSync("vp", ["run", "--filter", "safe-npm-sdk", "gen:readme"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (regen.status !== 0) {
    console.warn("  (gen:readme failed or no script — continuing; regenerate manually if needed)");
  } else {
    console.log("✓ regenerated README fragments");
  }

  // 3. Stage, commit, tag. Only package.json + README are release artifacts;
  //    if gen:readme touched nothing else, the staging is a no-op for it.
  git(["add", "packages/safe-npm-sdk/package.json", "packages/safe-npm-sdk/README.md"]);
  // gen:readme may have left README unchanged; only commit if there's something.
  if (git(["status", "--porcelain"], { capture: true }) !== "") {
    git(["commit", "-m", `chore(release): safe-npm-sdk@${next}`]);
    console.log(`✓ committed`);
  } else {
    console.log("  (nothing to commit beyond package.json — already committed)");
    git(["commit", "-m", `chore(release): safe-npm-sdk@${next}`]);
  }
  git(["tag", `v${next}`]);
  console.log(`✓ tagged v${next}`);

  console.log(`\nDone. Push to publish:`);
  console.log(`  git push origin main && git push origin v${next}`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
