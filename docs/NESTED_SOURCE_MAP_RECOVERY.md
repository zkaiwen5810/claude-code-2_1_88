# Nested Source-Map Recovery

## Completion Status

Completed on 2026-07-30 by:

- adding `scripts/nested-source-map-recovery.js`;
- adding focused coverage in
  `scripts/nested-source-map-recovery.test.js`;
- restoring all 552 nested destinations under `restored-src/`, with the final
  modified destination restored after explicit approval; and
- generating `restored-src/source-recovery-manifest.json`.

The existing `extract-sources.js` behavior was not changed. The nested
recovery is a separate, audit-first pass over the already reconstructed
workspace.

This remains an unofficial recovery from released source-map evidence. The
nested content improves readability and typing, but it does not establish an
authoritative upstream repository layout.

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

## Implemented Work

- [x] Extend the recovery tooling without changing the existing
  one-level behavior by default.
- [x] Inspect each outer `sourcesContent` entry for an inline
  `sourceMappingURL=data:application/json;base64,...` or equivalent.
- [x] Decode and validate base64 and percent-encoded nested source maps.
- [x] Extract every available nested `sourcesContent` entry.
- [x] Resolve nested source paths safely and deterministically.
- [x] Compare nested content with the current file before writing anything,
  and recheck it immediately before each write.
- [x] Replace an outer reconstructed source only when its nested source has an
  unambiguous destination.
- [x] Record whether each restored file came from outer or nested
  `sourcesContent`.

## Usage

The default is a read-only, repository-wide audit:

```sh
node scripts/nested-source-map-recovery.js
```

For machine-readable details, including every proposed destination and
reference issue:

```sh
node scripts/nested-source-map-recovery.js --json
```

Writing requires an explicit flag:

```sh
node scripts/nested-source-map-recovery.js --write
```

Modified destinations are still skipped in write mode. Overwriting them
requires the additional, explicit `--overwrite-modified` approval flag. Write
mode is confined to the `restored-src/` research workspace, and the manifest
must remain inside the selected output directory.

Run the focused fixture suite with:

```sh
node --test scripts/nested-source-map-recovery.test.js
```

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

The audit reports all of these fields in both human-readable and JSON forms.
Its unavailable-module/build-time scan is intentionally heuristic: it extracts
static module specifiers and flags constructs such as `bun:bundle`,
`feature()`, `import.meta`, and `process.env`.

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

The implementation rejects absolute, URL-like, query-bearing, and traversal
paths. It consumes exactly one leading `../` from an outer source-map entry as
the known `cli.js.map` source-base convention, then rejects any remaining
traversal. Nested paths and `sourceRoot` values never receive that exception.

Candidates sharing a destination are reported as collisions and are all
skipped, even when their content hashes agree. Writes use a temporary sibling
and atomic rename. A second current-content check prevents a file edited
between audit and write from being overwritten.

The manifest groups all 4,756 outer entries by their 4,471 distinct
destinations, while retaining every outer source-map index and every nested
source index as evidence.

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

## Recovery Results

The initial audit, before nested writes, reported:

| Measurement | Count |
| --- | ---: |
| Outer sources examined | 4,756 |
| Outer entries with content | 4,756 |
| Inline data source maps | 552 |
| Valid nested maps | 552 |
| Invalid nested maps | 0 |
| Nested sources with embedded content | 552 |
| Proposed destinations | 552 |
| Path collisions / ambiguous mappings | 0 / 0 |
| Files whose content would change | 552 |
| Local or post-recovery modifications | 1 |
| Sources with unavailable/build-time references | 85 |
| Outer React Compiler outputs with nested evidence | 395 |
| Nested sources retaining compiler machinery | 0 |

All 552 released nested maps are one-to-one. Multi-source maps, collisions,
missing `sourcesContent`, malformed data URIs, traversal, absolute paths,
modified files, and audit-to-write races are covered by synthetic fixtures.

The initial safe write restored 551 files and skipped
`restored-src/src/state/AppState.tsx`. That file had a committed, manual
post-recovery generic-signature edit, so it was correctly treated as locally
modified. It was subsequently restored only after a human explicitly approved
`--overwrite-modified`. The final audit reports all 552 destinations already
nested, zero files that would change, and zero local modifications.
Re-generating the final manifest produces the same SHA-256:

```text
965f72c2859ae37c0309f8a9a69f15df3dc38fc4233b6bc98942457f5322ceef
```

The manifest currently records:

| Provenance | Distinct destinations |
| --- | ---: |
| Outer `sourcesContent` | 3,919 |
| Nested `sourcesContent` | 552 |
| Local or post-recovery modification | 0 |
| Missing | 0 |

None of the 552 current nested candidates contains `react/compiler-runtime`,
`_c(...)`, or `react.memo_cache_sentinel` machinery. Restored examples retain
pre-compiler declarations such as `useAppState<T>`,
`useAppStateMaybeOutsideOfProvider<T>`, `useVoiceState<T>`, `showDialog<T>`,
and generic selection components.

The static reference audit reports build/runtime-provided constructs rather
than treating them as silently available. Besides `bun:bundle` and environment
or feature gates, the current unavailable-source evidence includes:

- `src/utils/ultraplan/prompt.txt`;
- `src/ink/global.d.ts`;
- `src/components/AntModelSwitchCallout.tsx`;
- `src/components/UndercoverAutoCallout.tsx`; and
- `src/proactive/useProactive.ts`.

These are recovery limitations, not a reason to add broad ambient shims.

## TypeScript Validation

The required TypeScript command still exits nonzero because recovered-source
semantic diagnostics are expected:

```sh
npx --yes -p typescript@5.9.3 tsc --noEmit \
  --project restored-src/tsconfig.json --pretty false
```

The comparison was:

| Diagnostic measure | Before | After |
| --- | ---: | ---: |
| Total diagnostics | 717 | 629 |
| `TS2307` missing modules | 0 | 0 |
| `TS7006` implicit parameter `any` | 0 | 0 |
| `TS7031` implicit binding `any` | 0 | 0 |
| `TS7053` implicit index `any` | 0 | 0 |
| `TS2554` argument-count mismatches | 15 | 2 |
| `TS2339` missing properties | 414 | 319 |

The configured workspace has `strict: false`, so implicit-`any` counts are not
a sensitive quality metric here. There is also no single diagnostic code for
an erased generic. The more direct evidence is the recovered TypeScript
signatures themselves and the removal of React Compiler output. The aggregate
diagnostic reduction is useful but should not be attributed solely to one
category.

The released artifacts remained byte-identical:

```text
75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f  package/cli.js
7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657  package/cli.js.map
```

## Remaining Limitations

- The tool recovers one nested inline source-map layer. It does not follow
  external source-map URLs or recurse indefinitely.
- Indexed source maps using `sections` are rejected unless they also expose
  the ordinary version-3 `sources` shape.
- Module availability and build-time construct detection is a conservative
  static audit, not a bundler or TypeScript resolution replacement.
- Nested `sourcesContent` bytes are preserved exactly. Consequently,
  `git diff --check` reports the source map's extra blank line at EOF in
  `src/components/LogoV2/LogoV2.tsx`; trimming it would break byte-for-byte
  evidence and the recorded content hash.
- Existing declaration stubs and expected semantic diagnostics remain outside
  this recovery pass.

## Acceptance Criteria

- The tool can perform a read-only repository-wide audit.
- It never overwrites an ambiguous or locally modified destination
  automatically.
- Unambiguous nested sources can be restored reproducibly.
- A provenance manifest is generated.
- Editor typing improves without introducing broad wildcard or `any` shims.
- Remaining diagnostics and recovery limitations are documented.

All acceptance criteria are met.
