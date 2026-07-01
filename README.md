# swarm-sandbox

Minimal, zero-dependency Node.js sandbox project.

## Purpose

This repository is a self-validating baseline. It contains a healthcheck
script that confirms the repository structure and `package.json` manifest
integrity, so any clone can prove it is well-formed with no install step.

## Usage

Requires Node.js >= 18. No dependencies, no `npm install` needed.

```sh
npm test            # runs the healthcheck
npm run healthcheck # same check, explicit
node scripts/healthcheck.js
```

Exit code `0` means all checks passed; exit code `1` means one or more
checks failed (each failure is printed on its own line).

## How the healthcheck works

`scripts/healthcheck.js` uses only Node built-in modules (`fs`, `path`,
`process`). It:

1. Resolves the repository root from its own location
   (`path.resolve(__dirname, '..')`), not the current working directory.
2. Verifies each file in a single `REQUIRED_FILES` manifest exists
   (`README.md`, `package.json`, `scripts/healthcheck.js`).
   `.gitignore` is intentionally not required.
3. Parses `package.json` inside a `try/catch`; invalid JSON is reported
   as a clean failure.
4. Confirms the `scripts.healthcheck` and `scripts.test` keys exist
   (presence only — never their command values).
5. Collects all failures, prints `ok`/`fail` status lines, and exits
   `0` on success or `1` on failure.
