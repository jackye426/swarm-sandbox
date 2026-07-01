// swarm-sandbox healthcheck
// Zero-dependency, CommonJS, no shebang.
// Self-validates repository structure and manifest integrity.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// Single manifest of required files (relative to repo root).
// Intentionally does NOT include .gitignore.
const REQUIRED_FILES = [
  'README.md',
  'package.json',
  'scripts/healthcheck.js',
];

// Script keys that must exist in package.json (presence only, never values).
const REQUIRED_SCRIPT_KEYS = ['healthcheck', 'test'];

const failures = [];

// 1. File existence checks
for (const rel of REQUIRED_FILES) {
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs)) {
    console.log(`ok   file ${rel}`);
  } else {
    console.log(`fail file ${rel} missing`);
    failures.push(`missing required file: ${rel}`);
  }
}

// 2. Parse package.json and verify required script keys
const pkgPath = path.join(repoRoot, 'package.json');
let pkg = null;

if (fs.existsSync(pkgPath)) {
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
    pkg = JSON.parse(raw);
    console.log('ok   package.json parsed');
  } catch (err) {
    console.log(`fail package.json invalid JSON: ${err.message}`);
    failures.push(`invalid JSON in package.json: ${err.message}`);
  }
}

if (pkg && typeof pkg === 'object') {
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  for (const key of REQUIRED_SCRIPT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(scripts, key)) {
      console.log(`ok   script key scripts.${key}`);
    } else {
      console.log(`fail script key scripts.${key} missing`);
      failures.push(`missing required script key: scripts.${key}`);
    }
  }
}

// 3. Collect-all-failures, then exit
if (failures.length === 0) {
  console.log('healthcheck: PASS');
  process.exit(0);
} else {
  console.log(`healthcheck: FAIL (${failures.length})`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
