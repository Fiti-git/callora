#!/usr/bin/env node
// Runs `npm test` in every workspace that defines a "test" script, then runs
// the root vitest config. Always finishes (does not abort on first failure).
// Prints a summary at the end and exits 1 if any workspace failed.

const { spawnSync } = require("node:child_process");
const { readdirSync, statSync, readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");

function listServices() {
  const dir = join(ROOT, "services");
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory())
    .filter((p) => existsSync(join(p, "package.json")))
    .filter((p) => {
      const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
      return pkg.scripts && pkg.scripts.test;
    });
}

function run(label, cmd, args, opts = {}) {
  process.stdout.write(`\n\n========== ${label} ==========\n`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || ROOT,
    shell: true,
  });
  return r.status === 0;
}

const results = [];

for (const svc of listServices()) {
  const name = svc.split(/[\\/]/).pop();
  const ok = run(`services/${name}`, "npm", ["test"], { cwd: svc });
  results.push({ name: `services/${name}`, ok });
}

const rootOk = run("root", "npx", ["vitest", "run", "--config", "vitest.root.config.ts"]);
results.push({ name: "root", ok: rootOk });

console.log("\n\n========== SUMMARY ==========");
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} workspaces passed.`);
process.exit(failed > 0 ? 1 : 0);
