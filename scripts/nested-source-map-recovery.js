#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const moduleApi = require('node:module');
const path = require('node:path');

const INLINE_DATA_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL\s*=\s*|\/\*[#@]\s*sourceMappingURL\s*=\s*)(data:[^\s*]+)/g;
const REACT_COMPILER_RE =
  /react\/compiler-runtime|react\.memo_cache_sentinel|\b_c\s*\(/;
const BUILD_TIME_PATTERNS = [
  ['bun:bundle', /(?:from\s+|require\(\s*)['"]bun:bundle['"]/],
  ['feature()', /\bfeature\s*\(/],
  ['import.meta', /\bimport\.meta\b/],
  ['process.env', /\bprocess\.env(?:\.|\[)/],
  ['compile-time global', /\b__(?:DEV|PROFILE|TEST__|BROWSER)__\b/],
];
const SOURCE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.d.ts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];
const INDEX_EXTENSIONS = [
  'index.ts',
  'index.tsx',
  'index.d.ts',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
  'index.json',
];
const BUILT_INS = new Set([
  ...moduleApi.builtinModules,
  ...moduleApi.builtinModules.map((name) => `node:${name}`),
]);

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

function assertSafeRelative(value, label, options = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is empty`);
  }
  if (value.includes('\0')) {
    throw new Error(`${label} contains a NUL byte`);
  }

  const normalizedSeparators = toPosix(value);
  if (
    normalizedSeparators.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedSeparators) ||
    /^[A-Za-z][A-Za-z+.-]*:/.test(normalizedSeparators)
  ) {
    throw new Error(`${label} is absolute or URL-like`);
  }
  if (
    !options.allowQueryOrFragment &&
    (normalizedSeparators.includes('?') || normalizedSeparators.includes('#'))
  ) {
    throw new Error(`${label} contains a query or fragment`);
  }

  const parts = normalizedSeparators.split('/');
  if (parts.includes('..')) {
    throw new Error(`${label} contains a path traversal component`);
  }

  const clean = parts.filter((part) => part !== '' && part !== '.').join('/');
  if (!clean) {
    if (options.allowEmptyAfterNormalization) {
      return '';
    }
    throw new Error(`${label} has no path components`);
  }
  return clean;
}

function resolveOuterDestination(sourceName) {
  if (typeof sourceName !== 'string') {
    throw new Error('outer source name is not a string');
  }

  let relative = toPosix(sourceName).replace(/\?.*$/, '');
  const nodeModulesAt = relative.lastIndexOf('node_modules/');
  if (nodeModulesAt !== -1) {
    relative = relative.slice(nodeModulesAt);
  } else {
    relative = relative
      .replace(/^webpack:\/\/\//, '')
      .replace(/^webpack:\/\//, '');

    // All released cli.js.map entries use one "../" to express the source-map
    // base. Consume exactly that known prefix, then reject any remaining
    // traversal instead of resolving it against the filesystem.
    if (relative.startsWith('../')) {
      relative = relative.slice(3);
    }
  }

  if (!relative || relative === 'webpack/bootstrap') {
    throw new Error('outer source has no deterministic destination');
  }
  return assertSafeRelative(relative, 'outer source path');
}

function resolveNestedDestination(outerDestination, sourceRoot, nestedSource) {
  const outer = assertSafeRelative(
    outerDestination,
    'outer destination',
  );
  const source = assertSafeRelative(nestedSource, 'nested source path');
  let root = '';
  if (sourceRoot !== undefined && sourceRoot !== null && sourceRoot !== '') {
    root = assertSafeRelative(sourceRoot, 'nested sourceRoot', {
      allowEmptyAfterNormalization: true,
    });
  }

  const combined = path.posix.join(
    path.posix.dirname(outer),
    root,
    source,
  );
  return assertSafeRelative(combined, 'nested destination');
}

function decodeInlineSourceMap(dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
    throw new Error('source map URL is not a data URI');
  }

  const comma = dataUri.indexOf(',');
  if (comma === -1) {
    throw new Error('data URI has no payload separator');
  }

  const metadata = dataUri.slice(5, comma);
  const fields = metadata.split(';');
  const mediaType = fields[0].toLowerCase();
  if (
    mediaType !== 'application/json' &&
    mediaType !== 'text/json' &&
    mediaType !== 'application/octet-stream'
  ) {
    throw new Error(`unsupported data URI media type: ${mediaType || '(empty)'}`);
  }

  let payload = dataUri.slice(comma + 1);
  let jsonText;
  if (fields.some((field) => field.toLowerCase() === 'base64')) {
    try {
      payload = decodeURIComponent(payload);
    } catch {
      throw new Error('base64 payload has invalid percent encoding');
    }
    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) ||
      payload.length % 4 === 1
    ) {
      throw new Error('base64 payload is malformed');
    }
    jsonText = Buffer.from(payload, 'base64').toString('utf8');
  } else {
    try {
      jsonText = decodeURIComponent(payload);
    } catch {
      throw new Error('data URI payload has invalid percent encoding');
    }
  }

  let nestedMap;
  try {
    nestedMap = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`payload is not JSON: ${error.message}`);
  }
  if (!nestedMap || typeof nestedMap !== 'object' || Array.isArray(nestedMap)) {
    throw new Error('nested source map is not an object');
  }
  if (nestedMap.version !== 3) {
    throw new Error(`unsupported source-map version: ${nestedMap.version}`);
  }
  if (!Array.isArray(nestedMap.sources)) {
    throw new Error('nested source map has no sources array');
  }
  if (!nestedMap.sources.every((source) => typeof source === 'string')) {
    throw new Error('nested source map has a non-string source name');
  }
  if (
    nestedMap.sourcesContent !== undefined &&
    !Array.isArray(nestedMap.sourcesContent)
  ) {
    throw new Error('nested sourcesContent is not an array');
  }
  if (
    nestedMap.sourcesContent &&
    nestedMap.sourcesContent.length > nestedMap.sources.length
  ) {
    throw new Error('nested sourcesContent is longer than sources');
  }
  if (typeof nestedMap.mappings !== 'string') {
    throw new Error('nested source map has no mappings string');
  }
  return nestedMap;
}

function extractModuleSpecifiers(content) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[A-Za-z0-9_$*{},\s]+?\s+from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers].sort();
}

function sourcePathExists(basePath, plannedAbsolutePaths) {
  const parsed = path.parse(basePath);
  const baseWithoutJsExtension = /\.(?:mjs|cjs|jsx|js)$/.test(parsed.ext)
    ? path.join(parsed.dir, parsed.name)
    : basePath;
  const candidates = new Set();
  for (const extension of SOURCE_EXTENSIONS) {
    candidates.add(`${basePath}${extension}`);
    candidates.add(`${baseWithoutJsExtension}${extension}`);
  }
  for (const filename of INDEX_EXTENSIONS) {
    candidates.add(path.join(basePath, filename));
    candidates.add(path.join(baseWithoutJsExtension, filename));
  }
  for (const candidate of candidates) {
    if (plannedAbsolutePaths.has(path.resolve(candidate))) {
      return true;
    }
    try {
      if (fs.statSync(candidate).isFile()) {
        return true;
      }
    } catch {
      // An unavailable candidate is expected during an audit.
    }
  }
  return false;
}

function packageNameFor(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function moduleIsAvailable(specifier, destination, outDir, plannedPaths) {
  if (BUILT_INS.has(specifier)) {
    return true;
  }
  if (specifier.startsWith('bun:')) {
    return false;
  }

  if (specifier.startsWith('.')) {
    return sourcePathExists(
      path.resolve(path.dirname(destination), specifier),
      plannedPaths,
    );
  }
  if (specifier.startsWith('src/')) {
    return sourcePathExists(
      path.resolve(outDir, specifier),
      plannedPaths,
    );
  }
  if (specifier.startsWith('vendor/')) {
    return sourcePathExists(
      path.resolve(outDir, specifier),
      plannedPaths,
    );
  }
  if (/^[A-Za-z][A-Za-z+.-]*:/.test(specifier)) {
    return false;
  }

  const packageName = packageNameFor(specifier);
  const packageLocations = [
    path.join(outDir, 'node_modules', packageName),
    path.join(outDir, 'types', 'npm', packageName),
    path.join(outDir, 'types', '@types', packageName.replace(/^@/, '').replace('/', '__')),
  ];
  return packageLocations.some((location) => {
    try {
      return fs.statSync(location).isDirectory();
    } catch {
      return false;
    }
  });
}

function inspectSourceReferences(candidate, outDir, plannedAbsolutePaths) {
  const destination = path.resolve(outDir, candidate.destination);
  const unavailableModules = extractModuleSpecifiers(candidate.content).filter(
    (specifier) =>
      !moduleIsAvailable(
        specifier,
        destination,
        outDir,
        plannedAbsolutePaths,
      ),
  );
  const buildTimeConstructs = BUILD_TIME_PATTERNS.filter(([, pattern]) =>
    pattern.test(candidate.content),
  ).map(([label]) => label);
  return {
    destination: candidate.destination,
    unavailableModules,
    buildTimeConstructs,
  };
}

function readCurrentState(candidate, outDir, outerEvidenceByDestination) {
  const absolutePath = path.resolve(outDir, candidate.destination);
  if (!fs.existsSync(absolutePath)) {
    return { state: 'missing', currentHash: null };
  }
  const current = fs.readFileSync(absolutePath);
  const currentHash = sha256(current);
  if (currentHash === candidate.contentHash) {
    return { state: 'nested', currentHash };
  }
  const outerEvidence = outerEvidenceByDestination.get(candidate.destination) || [];
  if (outerEvidence.some((entry) => entry.contentHash === currentHash)) {
    return { state: 'outer', currentHash };
  }
  return { state: 'local-or-post-recovery-modification', currentHash };
}

function compareCandidates(left, right) {
  return (
    left.destination.localeCompare(right.destination) ||
    left.outerSourceMapIndex - right.outerSourceMapIndex ||
    left.inlineMapIndex - right.inlineMapIndex ||
    left.nestedSourceIndex - right.nestedSourceIndex
  );
}

function buildAudit({ mapPath, outDir }) {
  const resolvedMapPath = path.resolve(mapPath);
  const resolvedOutDir = path.resolve(outDir);
  const mapBytes = fs.readFileSync(resolvedMapPath);
  let outerMap;
  try {
    outerMap = JSON.parse(mapBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`outer source map is not valid JSON: ${error.message}`);
  }
  if (!outerMap || !Array.isArray(outerMap.sources)) {
    throw new Error('outer source map has no sources array');
  }

  const sourcesContent = Array.isArray(outerMap.sourcesContent)
    ? outerMap.sourcesContent
    : [];
  const outerEvidence = [];
  const outerEvidenceByDestination = new Map();
  const invalidOuterPaths = [];
  for (let index = 0; index < outerMap.sources.length; index += 1) {
    const source = outerMap.sources[index];
    const content = sourcesContent[index];
    try {
      const destination = resolveOuterDestination(source);
      const evidence = {
        sourceMapIndex: index,
        source,
        destination,
        contentHash: typeof content === 'string' ? sha256(content) : null,
      };
      outerEvidence.push(evidence);
      const atDestination = outerEvidenceByDestination.get(destination) || [];
      atDestination.push(evidence);
      outerEvidenceByDestination.set(destination, atDestination);
    } catch (error) {
      invalidOuterPaths.push({
        outerSourceMapIndex: index,
        outerSource: source,
        reason: error.message,
      });
    }
  }

  let inlineMapsFound = 0;
  let validNestedMaps = 0;
  let nestedSourcesWithContent = 0;
  let nestedSourcesWithoutContent = 0;
  const invalidNestedMaps = [];
  const rejectedMappings = [];
  const candidates = [];

  for (let outerIndex = 0; outerIndex < outerMap.sources.length; outerIndex += 1) {
    const outerSource = outerMap.sources[outerIndex];
    const outerContent = sourcesContent[outerIndex];
    if (typeof outerContent !== 'string') {
      continue;
    }

    let outerDestination;
    try {
      outerDestination = resolveOuterDestination(outerSource);
    } catch {
      outerDestination = null;
    }

    let inlineMapIndex = 0;
    for (const match of outerContent.matchAll(INLINE_DATA_MAP_RE)) {
      inlineMapsFound += 1;
      const thisInlineMapIndex = inlineMapIndex;
      inlineMapIndex += 1;
      let nestedMap;
      try {
        nestedMap = decodeInlineSourceMap(match[1]);
        validNestedMaps += 1;
      } catch (error) {
        invalidNestedMaps.push({
          outerSourceMapIndex: outerIndex,
          outerSource,
          inlineMapIndex: thisInlineMapIndex,
          reason: error.message,
        });
        continue;
      }

      for (
        let nestedIndex = 0;
        nestedIndex < nestedMap.sources.length;
        nestedIndex += 1
      ) {
        const nestedSource = nestedMap.sources[nestedIndex];
        const content = nestedMap.sourcesContent?.[nestedIndex];
        if (typeof content !== 'string') {
          nestedSourcesWithoutContent += 1;
          continue;
        }
        nestedSourcesWithContent += 1;

        if (!outerDestination) {
          rejectedMappings.push({
            outerSourceMapIndex: outerIndex,
            outerSource,
            inlineMapIndex: thisInlineMapIndex,
            nestedSourceIndex: nestedIndex,
            nestedSource,
            reason: 'outer source has no safe destination',
          });
          continue;
        }

        try {
          const destination = resolveNestedDestination(
            outerDestination,
            nestedMap.sourceRoot,
            nestedSource,
          );
          candidates.push({
            outerSourceMapIndex: outerIndex,
            outerSource,
            outerDestination,
            outerContentHash: sha256(outerContent),
            inlineMapIndex: thisInlineMapIndex,
            nestedSourceIndex: nestedIndex,
            nestedSource,
            sourceRoot: nestedMap.sourceRoot ?? null,
            destination,
            content,
            contentHash: sha256(content),
          });
        } catch (error) {
          rejectedMappings.push({
            outerSourceMapIndex: outerIndex,
            outerSource,
            inlineMapIndex: thisInlineMapIndex,
            nestedSourceIndex: nestedIndex,
            nestedSource,
            reason: error.message,
          });
        }
      }
    }
  }

  candidates.sort(compareCandidates);
  const candidatesByDestination = new Map();
  for (const candidate of candidates) {
    const entries = candidatesByDestination.get(candidate.destination) || [];
    entries.push(candidate);
    candidatesByDestination.set(candidate.destination, entries);
  }
  const collisions = [...candidatesByDestination.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([destination, entries]) => ({
      destination,
      identicalContent:
        new Set(entries.map((entry) => entry.contentHash)).size === 1,
      entries: entries.map((entry) => ({
        outerSourceMapIndex: entry.outerSourceMapIndex,
        outerSource: entry.outerSource,
        inlineMapIndex: entry.inlineMapIndex,
        nestedSourceIndex: entry.nestedSourceIndex,
        nestedSource: entry.nestedSource,
        contentHash: entry.contentHash,
      })),
    }));
  const collisionDestinations = new Set(
    collisions.map((collision) => collision.destination),
  );

  for (const candidate of candidates) {
    const current = readCurrentState(
      candidate,
      resolvedOutDir,
      outerEvidenceByDestination,
    );
    candidate.currentState = current.state;
    candidate.currentContentHash = current.currentHash;
    candidate.ambiguous = collisionDestinations.has(candidate.destination);
    candidate.wouldChange = current.currentHash !== candidate.contentHash;
    candidate.outerHasReactCompilerOutput =
      REACT_COMPILER_RE.test(outerContentFor(outerMap, candidate.outerSourceMapIndex));
    candidate.nestedHasReactCompilerOutput = REACT_COMPILER_RE.test(
      candidate.content,
    );
  }

  const plannedAbsolutePaths = new Set(
    candidates.map((candidate) =>
      path.resolve(resolvedOutDir, candidate.destination),
    ),
  );
  const sourceIssues = candidates
    .map((candidate) =>
      inspectSourceReferences(
        candidate,
        resolvedOutDir,
        plannedAbsolutePaths,
      ),
    )
    .filter(
      (issue) =>
        issue.unavailableModules.length > 0 ||
        issue.buildTimeConstructs.length > 0,
    );

  const proposedDestinations = [...candidatesByDestination.keys()].sort();
  const filesWouldChange = candidates
    .filter((candidate) => candidate.wouldChange)
    .map((candidate) => candidate.destination)
    .filter((destination, index, all) => all.indexOf(destination) === index)
    .sort();
  const locallyModifiedFiles = candidates
    .filter(
      (candidate) =>
        candidate.currentState === 'local-or-post-recovery-modification',
    )
    .map((candidate) => candidate.destination)
    .filter((destination, index, all) => all.indexOf(destination) === index)
    .sort();
  const compilerRecovery = {
    outerCompilerOutputs: candidates.filter(
      (candidate) => candidate.outerHasReactCompilerOutput,
    ).length,
    nestedSourcesStillContainingCompilerOutput: candidates
      .filter((candidate) => candidate.nestedHasReactCompilerOutput)
      .map((candidate) => candidate.destination)
      .sort(),
  };

  return {
    schemaVersion: 1,
    mode: 'audit',
    mapPath: resolvedMapPath,
    mapHash: sha256(mapBytes),
    outDir: resolvedOutDir,
    summary: {
      outerSourcesExamined: outerMap.sources.length,
      outerSourcesWithContent: sourcesContent.filter(
        (content) => typeof content === 'string',
      ).length,
      inlineMapsFound,
      validNestedMaps,
      invalidNestedMaps: invalidNestedMaps.length,
      nestedSourcesWithContent,
      nestedSourcesWithoutContent,
      proposedDestinations: proposedDestinations.length,
      pathCollisions: collisions.length,
      ambiguousMappings: collisions.length + rejectedMappings.length,
      filesThatWouldChange: filesWouldChange.length,
      locallyModifiedFiles: locallyModifiedFiles.length,
      sourcesWithReferenceIssues: sourceIssues.length,
    },
    proposedDestinations,
    filesWouldChange,
    locallyModifiedFiles,
    invalidNestedMaps,
    invalidOuterPaths,
    rejectedMappings,
    collisions,
    sourceIssues,
    compilerRecovery,
    outerEvidence,
    candidates,
  };
}

function outerContentFor(outerMap, index) {
  const content = outerMap.sourcesContent?.[index];
  return typeof content === 'string' ? content : '';
}

function atomicWrite(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.nested-recovery-${process.pid}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, filename);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
}

function relativeForManifest(filename, repositoryRoot) {
  return toPosix(path.relative(repositoryRoot, filename));
}

function createManifest(audit, repositoryRoot) {
  const evidenceByDestination = new Map();
  for (const outer of audit.outerEvidence) {
    const record = evidenceByDestination.get(outer.destination) || {
      destination: outer.destination,
      outerEvidence: [],
      nestedEvidence: [],
    };
    record.outerEvidence.push({
      sourceMapIndex: outer.sourceMapIndex,
      source: outer.source,
      contentHash: outer.contentHash,
    });
    evidenceByDestination.set(outer.destination, record);
  }
  for (const nested of audit.candidates) {
    const record = evidenceByDestination.get(nested.destination) || {
      destination: nested.destination,
      outerEvidence: [],
      nestedEvidence: [],
    };
    record.nestedEvidence.push({
      outerSourceMapIndex: nested.outerSourceMapIndex,
      outerSource: nested.outerSource,
      inlineMapIndex: nested.inlineMapIndex,
      nestedSourceIndex: nested.nestedSourceIndex,
      nestedSource: nested.nestedSource,
      sourceRoot: nested.sourceRoot,
      contentHash: nested.contentHash,
      ambiguous: nested.ambiguous,
    });
    evidenceByDestination.set(nested.destination, record);
  }

  const files = [...evidenceByDestination.values()]
    .sort((left, right) => left.destination.localeCompare(right.destination))
    .map((record) => {
      const absolutePath = path.resolve(audit.outDir, record.destination);
      let currentContentHash = null;
      if (fs.existsSync(absolutePath)) {
        currentContentHash = sha256(fs.readFileSync(absolutePath));
      }
      let provenance = 'missing';
      if (
        record.nestedEvidence.some(
          (entry) => entry.contentHash === currentContentHash,
        )
      ) {
        provenance = 'nested-sourcesContent';
      } else if (
        record.outerEvidence.some(
          (entry) => entry.contentHash === currentContentHash,
        )
      ) {
        provenance = 'outer-sourcesContent';
      } else if (currentContentHash) {
        provenance = 'local-or-post-recovery-modification';
      }
      return {
        destination: record.destination,
        provenance,
        currentContentHash,
        outerEvidence: record.outerEvidence.sort(
          (left, right) => left.sourceMapIndex - right.sourceMapIndex,
        ),
        nestedEvidence: record.nestedEvidence.sort(
          (left, right) =>
            left.outerSourceMapIndex - right.outerSourceMapIndex ||
            left.inlineMapIndex - right.inlineMapIndex ||
            left.nestedSourceIndex - right.nestedSourceIndex,
        ),
      };
    });

  return {
    schemaVersion: 1,
    description:
      'Unofficial recovery provenance derived from released source-map evidence.',
    outerSourceMap: relativeForManifest(audit.mapPath, repositoryRoot),
    outerSourceMapSha256: audit.mapHash,
    outputRoot: relativeForManifest(audit.outDir, repositoryRoot),
    summary: {
      files: files.length,
      outerSourcesContent: files.filter(
        (file) => file.provenance === 'outer-sourcesContent',
      ).length,
      nestedSourcesContent: files.filter(
        (file) => file.provenance === 'nested-sourcesContent',
      ).length,
      locallyModified: files.filter(
        (file) =>
          file.provenance === 'local-or-post-recovery-modification',
      ).length,
      missing: files.filter((file) => file.provenance === 'missing').length,
    },
    files,
  };
}

function applyRecovery(
  audit,
  { overwriteModified = false, manifestPath, repositoryRoot },
) {
  const collisionDestinations = new Set(
    audit.collisions.map((collision) => collision.destination),
  );
  const outerEvidenceByDestination = new Map();
  for (const evidence of audit.outerEvidence) {
    const entries =
      outerEvidenceByDestination.get(evidence.destination) || [];
    entries.push(evidence);
    outerEvidenceByDestination.set(evidence.destination, entries);
  }
  const result = {
    written: [],
    alreadyNested: [],
    skippedAmbiguous: [],
    skippedModified: [],
  };

  for (const candidate of audit.candidates) {
    if (collisionDestinations.has(candidate.destination)) {
      result.skippedAmbiguous.push(candidate.destination);
      continue;
    }
    // Re-read immediately before each write. A file may have changed after the
    // audit was built but before applyRecovery reached this candidate.
    const current = readCurrentState(
      candidate,
      audit.outDir,
      outerEvidenceByDestination,
    );
    if (
      current.state === 'local-or-post-recovery-modification' &&
      !overwriteModified
    ) {
      result.skippedModified.push(candidate.destination);
      continue;
    }
    if (current.state === 'nested') {
      result.alreadyNested.push(candidate.destination);
      continue;
    }
    atomicWrite(
      path.resolve(audit.outDir, candidate.destination),
      candidate.content,
    );
    result.written.push(candidate.destination);
  }

  for (const key of Object.keys(result)) {
    result[key] = [...new Set(result[key])].sort();
  }
  const manifest = createManifest(audit, repositoryRoot);
  atomicWrite(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`);
  result.manifestPath = manifestPath;
  result.manifest = manifest;
  return result;
}

function publicAudit(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    mode: audit.mode,
    mapPath: audit.mapPath,
    mapHash: audit.mapHash,
    outDir: audit.outDir,
    summary: audit.summary,
    proposedDestinations: audit.proposedDestinations,
    filesWouldChange: audit.filesWouldChange,
    locallyModifiedFiles: audit.locallyModifiedFiles,
    invalidNestedMaps: audit.invalidNestedMaps,
    invalidOuterPaths: audit.invalidOuterPaths,
    rejectedMappings: audit.rejectedMappings,
    collisions: audit.collisions,
    sourceIssues: audit.sourceIssues,
    compilerRecovery: audit.compilerRecovery,
    candidates: audit.candidates.map(({ content, ...candidate }) => candidate),
  };
}

function printList(title, entries, formatter = (entry) => entry) {
  console.log(`\n${title} (${entries.length})`);
  if (entries.length === 0) {
    console.log('  none');
    return;
  }
  for (const entry of entries) {
    console.log(`  ${formatter(entry)}`);
  }
}

function printAudit(audit) {
  const summary = audit.summary;
  console.log('Nested source-map recovery audit (read-only default)');
  console.log(`Outer sources examined: ${summary.outerSourcesExamined}`);
  console.log(`Outer sources with content: ${summary.outerSourcesWithContent}`);
  console.log(`Inline data source maps found: ${summary.inlineMapsFound}`);
  console.log(`Valid nested maps: ${summary.validNestedMaps}`);
  console.log(`Invalid nested maps: ${summary.invalidNestedMaps}`);
  console.log(
    `Nested sources with embedded content: ${summary.nestedSourcesWithContent}`,
  );
  console.log(
    `Nested sources without embedded content: ${summary.nestedSourcesWithoutContent}`,
  );
  console.log(`Proposed destination paths: ${summary.proposedDestinations}`);
  console.log(`Path collisions: ${summary.pathCollisions}`);
  console.log(`Ambiguous mappings: ${summary.ambiguousMappings}`);
  console.log(`Files whose content would change: ${summary.filesThatWouldChange}`);
  console.log(
    `Files with local or post-recovery modifications: ${summary.locallyModifiedFiles}`,
  );
  console.log(
    `Nested sources with unavailable modules/build-time constructs: ${summary.sourcesWithReferenceIssues}`,
  );
  console.log(
    `Outer React Compiler outputs with nested evidence: ${audit.compilerRecovery.outerCompilerOutputs}`,
  );
  console.log(
    `Nested sources still containing React Compiler machinery: ${audit.compilerRecovery.nestedSourcesStillContainingCompilerOutput.length}`,
  );

  printList(
    'Invalid nested maps',
    audit.invalidNestedMaps,
    (entry) =>
      `${entry.outerSourceMapIndex}:${entry.inlineMapIndex} ${entry.outerSource} — ${entry.reason}`,
  );
  printList(
    'Rejected or ambiguous path mappings',
    audit.rejectedMappings,
    (entry) =>
      `${entry.outerSourceMapIndex}:${entry.inlineMapIndex}:${entry.nestedSourceIndex} ${entry.nestedSource} — ${entry.reason}`,
  );
  printList(
    'Path collisions',
    audit.collisions,
    (entry) =>
      `${entry.destination} (${entry.entries.length} entries; identical content: ${entry.identicalContent})`,
  );
  printList('Locally modified destinations', audit.locallyModifiedFiles);
  printList('Files whose content would change', audit.filesWouldChange);
  printList('Proposed destinations', audit.proposedDestinations);
  printList(
    'Unavailable-module/build-time reference audit',
    audit.sourceIssues,
    (entry) => {
      const details = [];
      if (entry.unavailableModules.length) {
        details.push(`unavailable: ${entry.unavailableModules.join(', ')}`);
      }
      if (entry.buildTimeConstructs.length) {
        details.push(`build-time: ${entry.buildTimeConstructs.join(', ')}`);
      }
      return `${entry.destination} — ${details.join('; ')}`;
    },
  );
}

function usage() {
  return `Usage: node scripts/nested-source-map-recovery.js [options]

Audit mode is the default and never writes files.

Options:
  --write                 Restore safe, unambiguous nested sources and manifest
  --overwrite-modified    With --write, explicitly approve modified destinations
  --json                  Print the complete audit as deterministic JSON
  --map PATH              Outer source map (default: package/cli.js.map)
  --out-dir PATH          Recovery workspace (default: restored-src)
  --manifest PATH         Provenance manifest path
  --help                  Show this help
`;
}

function parseArguments(argv, repositoryRoot) {
  const options = {
    write: false,
    overwriteModified: false,
    json: false,
    mapPath: path.join(repositoryRoot, 'package', 'cli.js.map'),
    outDir: path.join(repositoryRoot, 'restored-src'),
    manifestPath: path.join(
      repositoryRoot,
      'restored-src',
      'source-recovery-manifest.json',
    ),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') {
      options.write = true;
    } else if (argument === '--overwrite-modified') {
      options.overwriteModified = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help') {
      options.help = true;
    } else if (
      argument === '--map' ||
      argument === '--out-dir' ||
      argument === '--manifest'
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a path`);
      }
      index += 1;
      const resolved = path.resolve(value);
      if (argument === '--map') options.mapPath = resolved;
      if (argument === '--out-dir') options.outDir = resolved;
      if (argument === '--manifest') options.manifestPath = resolved;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  if (options.overwriteModified && !options.write) {
    throw new Error('--overwrite-modified requires --write');
  }
  if (options.write) {
    const workspaceRoot = path.resolve(repositoryRoot, 'restored-src');
    const relativeOutput = path.relative(workspaceRoot, options.outDir);
    if (
      relativeOutput === '..' ||
      relativeOutput.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeOutput)
    ) {
      throw new Error(
        '--write output must stay inside the restored-src research workspace',
      );
    }
    const relativeManifest = path.relative(options.outDir, options.manifestPath);
    if (
      relativeManifest === '..' ||
      relativeManifest.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeManifest)
    ) {
      throw new Error('--manifest must stay inside the selected output directory');
    }
  }
  return options;
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  let options;
  try {
    options = parseArguments(process.argv.slice(2), repositoryRoot);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const audit = buildAudit(options);
  if (options.json) {
    console.log(JSON.stringify(publicAudit(audit), null, 2));
  } else {
    printAudit(audit);
  }
  if (!options.write) {
    console.log('\nAudit only. Pass --write to restore eligible nested sources.');
    return;
  }

  const result = applyRecovery(audit, {
    overwriteModified: options.overwriteModified,
    manifestPath: options.manifestPath,
    repositoryRoot,
  });
  console.log('\nWrite result');
  console.log(`Written: ${result.written.length}`);
  console.log(`Already nested: ${result.alreadyNested.length}`);
  console.log(`Skipped ambiguous: ${result.skippedAmbiguous.length}`);
  console.log(`Skipped modified: ${result.skippedModified.length}`);
  console.log(
    `Manifest: ${relativeForManifest(result.manifestPath, repositoryRoot)}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  applyRecovery,
  buildAudit,
  createManifest,
  decodeInlineSourceMap,
  extractModuleSpecifiers,
  parseArguments,
  publicAudit,
  resolveNestedDestination,
  resolveOuterDestination,
  sha256,
};
