# swarm-sandbox

Minimal zero-dependency Node healthcheck sandbox. No `npm install` required.

## Purpose

This repo validates that a minimal Node.js project can bootstrap and self-verify
using only built-in modules (`fs`, `path`). It serves as a zero-dependency
baseline for testing repo scaffolding and healthcheck tooling.

## Usage

No installation needed. Run directly with Node >= 18:

```sh
npm test
npm run healthcheck
node scripts/healthcheck.js
```

All three commands are equivalent and require no prior `npm install`.

## How It Works

`scripts/healthcheck.js` resolves the repo root via `path.resolve(__dirname, '..')`,
then runs the following checks in sequence, collecting all failures before exiting:

1. **File existence** — verifies each entry in `REQUIRED_FILES` (`package.json`,
   `README.md`, `scripts/healthcheck.js`) is present and is a regular file.
2. **README non-empty** — reads `README.md` and confirms it has non-whitespace content.
3. **package.json validity** — parses `package.json` as JSON and reports any syntax error.
4. **Script keys** — confirms `scripts.healthcheck` and `scripts.test` exist in
   `package.json` (checks key presence only, not command values).

Exits `0` when all checks pass, `1` with a summary of failures otherwise.

## Requirements

- Node >= 18
