# TODO: Recover Pre-Compiler Sources From Nested Source Maps

## Goal

Improve the readability and editor typing of `restored-src/` by recovering
original TypeScript/TSX from inline source maps embedded in the outer
`package/cli.js.map` `sourcesContent`.

Some outer source-map entries contain React Compiler output rather than the
pre-compiler TypeScript. The compiler output retains an inline base64 source
map whose `sourcesContent` contains more readable source and TypeScript-only
declarations that the compiler erased.

For example, the outer reconstruction of `src/state/AppState.tsx` contains:

```ts
export function useAppState(selector) {
```

Its nested source map contains:

```ts
export function useAppState<T>(
  selector: (state: AppState) => T,
): T {
```

## Proposed Work

- Extend the recovery tooling, preferably without changing the existing
  one-level behavior by default.
- Inspect each outer `sourcesContent` entry for an inline
  `sourceMappingURL=data:application/json;base64,...` or equivalent.
- Decode and validate the nested source map.
- Extract every available nested `sourcesContent` entry.
- Resolve nested source paths safely and deterministically.
- Compare nested content with the current file before writing anything.
- Replace an outer reconstructed source only when its nested source has an
  unambiguous destination.
- Record whether each restored file came from outer or nested
  `sourcesContent`.

## Required Audit Mode

Before permitting writes, report:

- Number of outer sources examined.
- Number of inline source maps found.
- Number of valid and invalid nested maps.
- Number of nested sources with embedded content.
- Proposed destination paths.
- Path collisions and ambiguous mappings.
- Files whose content would change.
- Files with local or post-recovery modifications.
- Nested sources that reference unavailable modules or build-time constructs.

Audit mode must be the default. Writing should require an explicit option.

## Safety Requirements

- Do not overwrite files with local modifications without explicit approval.
- Reject absolute paths and path traversal components.
- Do not silently choose among path collisions.
- Preserve the released `package/` files; this task only updates the
  research/editor workspace under `restored-src/`.
- Preserve provenance. Nested sources are recovered evidence, not proof of an
  authoritative upstream repository layout.
- Make output deterministic so repeated extraction produces the same tree.
- Keep a manifest of source-map entry, nested source name, destination, and
  content hash.

## Validation

- Run:

  ```sh
  npx --yes -p typescript@5.9.3 tsc --noEmit \
    --project restored-src/tsconfig.json --pretty false
  ```

- Compare missing-module (`TS2307`) diagnostics before and after recovery.
- Compare implicit-`any` and erased-generic diagnostics before and after.
- Confirm restored TSX parses without React Compiler cache machinery such as
  `_c`, `$`, and `react.memo_cache_sentinel`, where nested pre-compiler source
  is available.
- Confirm `package/cli.js` and `package/cli.js.map` remain unchanged.
- Review a representative sample of one-to-one files, multi-source maps,
  collisions, missing `sourcesContent`, and malformed inline maps.

## Acceptance Criteria

- The tool can perform a read-only repository-wide audit.
- It never overwrites an ambiguous or locally modified destination
  automatically.
- Unambiguous nested sources can be restored reproducibly.
- A provenance manifest is generated.
- Editor typing improves without introducing broad wildcard or `any` shims.
- Remaining diagnostics and recovery limitations are documented.

