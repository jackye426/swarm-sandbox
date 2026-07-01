const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// Single manifest. NOTE: .gitignore deliberately excluded.
const REQUIRED_FILES = ['package.json', 'README.md', 'scripts/healthcheck.js'];
const REQUIRED_SCRIPT_KEYS = ['healthcheck', 'test'];

const failures = [];

// 1. File existence
for (const rel of REQUIRED_FILES) {
  const abs = path.resolve(repoRoot, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    console.log(`ok   file present: ${rel}`);
  } else {
    console.log(`fail file missing: ${rel}`);
    failures.push(`missing required file: ${rel}`);
  }
}

// 2. README non-empty (supports AC-1)
const readmePath = path.resolve(repoRoot, 'README.md');
if (fs.existsSync(readmePath) && fs.statSync(readmePath).isFile()) {
  if (fs.readFileSync(readmePath, 'utf8').trim().length === 0) {
    console.log('fail README.md is empty');
    failures.push('README.md is empty');
  } else {
    console.log('ok   README.md non-empty');
  }
}

// 3. Parse package.json + validate script keys
const pkgPath = path.resolve(repoRoot, 'package.json');
let pkg = null;
if (fs.existsSync(pkgPath)) {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  try {
    pkg = JSON.parse(raw);
    console.log('ok   package.json parsed');
  } catch (err) {
    console.log(`fail package.json invalid JSON: ${err.message}`);
    failures.push('package.json is not valid JSON');
  }
}

if (pkg) {
  const scripts = pkg.scripts || {};
  for (const key of REQUIRED_SCRIPT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(scripts, key)) {
      console.log(`ok   scripts.${key} key present`);
    } else {
      console.log(`fail scripts.${key} key missing`);
      failures.push(`missing required script key: scripts.${key}`);
    }
  }
}

// 4. Collect-all then exit
if (failures.length > 0) {
  console.log(`\nhealthcheck FAILED with ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nhealthcheck OK');
process.exit(0);
