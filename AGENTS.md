# Project guidance

## What this app is

iCalStripper is an Electron desktop app written in TypeScript. `main.ts` handles
application windows, file access, and iCalendar conversion; `preload.ts` exposes
the restricted `window.api` bridge; `renderer.ts` implements the UI. Calendar
files are parsed and generated with `ical-toolkit`.

## Development

- Use Node.js 22.12.0 or newer, as required by the current Electron release.
- Install the lockfile-resolved dependencies with `npm ci`.
- Run `npm run compile` after TypeScript changes.
- The `build-win`, `build-win-portable`, `build-linux`, and `build-mac` scripts
  compile TypeScript, copy runtime files/assets into `build`, and invoke
  electron-builder.
- UI assets live in `css/`, `fonts/`, and `resources/`; keep build scripts and
  packaging configuration in `package.json` in sync when adding assets.

## Electron boundaries

- Keep renderer access to privileged APIs behind `contextBridge` in
  `preload.ts`; renderer code should use `window.api`.
- Use `webUtils.getPathForFile` in the preload bridge to get dropped-file paths.
- Electron ships its own TypeScript declarations; do not add `@types/electron`.

## Dependency maintenance

- Keep `package-lock.json` committed and use npm to update dependencies.
- Check `npm outdated`, `npm run compile`, and `npm audit` after dependency
  updates. Avoid `npm audit fix --force` without reviewing its proposed major
  changes.
- The current latest `copyfiles` and `electron-builder` releases still resolve
  vulnerable transitive `minimatch` versions (GHSA-g3hv-75wg-m249). The audit
  fix suggested by npm would downgrade `copyfiles` to 1.x; do not apply that
  downgrade without validating the build.
