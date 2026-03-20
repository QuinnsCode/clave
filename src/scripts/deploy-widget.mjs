#!/usr/bin/env node
// scripts/deploy-widget.mjs
// Run after build:widget — uploads widget.js to R2

import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = pkg.version;
const BUCKET = "qlave-widget-bucket";
const LOCAL = "dist/widget/widget.js";

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Upload as latest
run(`wrangler r2 object put ${BUCKET}/latest/widget.js --file ${LOCAL} --content-type application/javascript --remote`);

// Upload versioned snapshot
run(`wrangler r2 object put ${BUCKET}/v${version}/widget.js --file ${LOCAL} --content-type application/javascript --remote`);

console.log(`\n✅ Deployed widget v${version} to R2`);
console.log(`   https://cdn.qlave.dev/widget.js`);
console.log(`   https://cdn.qlave.dev/widget.v${version}.js`);
