'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyRecovery,
  buildAudit,
  decodeInlineSourceMap,
  extractModuleSpecifiers,
  parseArguments,
  resolveNestedDestination,
  resolveOuterDestination,
} = require('./nested-source-map-recovery.js');

function inlineMap(map, encoding = 'base64') {
  const json = JSON.stringify(map);
  const payload =
    encoding === 'base64'
      ? Buffer.from(json).toString('base64')
      : encodeURIComponent(json);
  const metadata =
    encoding === 'base64'
      ? 'application/json;charset=utf-8;base64'
      : 'application/json;charset=utf-8';
  return `//# sourceMappingURL=data:${metadata},${payload}`;
}

function nestedMap(sources, sourcesContent) {
  return {
    version: 3,
    names: [],
    sources,
    sourcesContent,
    mappings: '',
  };
}

function fixture(outerEntries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-recovery-test-'));
  const outDir = path.join(root, 'restored-src');
  const mapPath = path.join(root, 'cli.js.map');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    mapPath,
    JSON.stringify({
      version: 3,
      sources: outerEntries.map((entry) => entry.source),
      sourcesContent: outerEntries.map((entry) => entry.content),
      mappings: '',
    }),
  );
  for (const entry of outerEntries) {
    if (entry.current !== undefined) {
      const destination = path.join(
        outDir,
        resolveOuterDestination(entry.source),
      );
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.current);
    }
  }
  return { root, outDir, mapPath };
}

test('decodes base64 and percent-encoded nested maps', () => {
  const map = nestedMap(['A.tsx'], ['export const a: number = 1\n']);
  for (const encoding of ['base64', 'percent']) {
    const uri = inlineMap(map, encoding).split('sourceMappingURL=')[1];
    assert.deepEqual(decodeInlineSourceMap(uri), map);
  }
});

test('module reference audit does not treat ordinary UI strings as imports', () => {
  const content = `
    import React, {
      type ReactNode,
    } from 'react'
    export { helper } from './helper.js'
    import './side-effect.js'
    const label = 'Jump to bottom'
  `;
  assert.deepEqual(extractModuleSpecifiers(content), [
    './helper.js',
    './side-effect.js',
    'react',
  ]);
});

test('audits and writes a one-to-one nested source', () => {
  const compiled = 'const A = 1;\n';
  const original = 'const A: number = 1\n';
  const sourceMap = inlineMap(nestedMap(['A.tsx'], [original]));
  const context = fixture([
    {
      source: '../src/A.tsx',
      content: `${compiled}${sourceMap}`,
      current: `${compiled}${sourceMap}`,
    },
  ]);
  const audit = buildAudit(context);

  assert.equal(audit.summary.validNestedMaps, 1);
  assert.equal(audit.summary.filesThatWouldChange, 1);
  assert.deepEqual(audit.proposedDestinations, ['src/A.tsx']);

  const manifestPath = path.join(context.outDir, 'manifest.json');
  const result = applyRecovery(audit, {
    overwriteModified: false,
    manifestPath,
    repositoryRoot: context.root,
  });
  assert.deepEqual(result.written, ['src/A.tsx']);
  assert.equal(
    fs.readFileSync(path.join(context.outDir, 'src/A.tsx'), 'utf8'),
    original,
  );
  assert.equal(result.manifest.summary.nestedSourcesContent, 1);
});

test('resolves every source in a multi-source nested map', () => {
  const map = inlineMap(
    nestedMap(
      ['first.ts', 'sub/second.ts'],
      ['export const first: number = 1\n', 'export const second: number = 2\n'],
    ),
  );
  const context = fixture([
    {
      source: '../src/generated/bundle.js',
      content: `compiled\n${map}`,
      current: `compiled\n${map}`,
    },
  ]);
  const audit = buildAudit(context);

  assert.equal(audit.summary.nestedSourcesWithContent, 2);
  assert.deepEqual(audit.proposedDestinations, [
    'src/generated/first.ts',
    'src/generated/sub/second.ts',
  ]);
});

test('reports collisions and never writes either colliding candidate', () => {
  const first = inlineMap(nestedMap(['shared.ts'], ['first\n']));
  const second = inlineMap(nestedMap(['shared.ts'], ['second\n']));
  const context = fixture([
    {
      source: '../src/a.js',
      content: `a\n${first}`,
      current: `a\n${first}`,
    },
    {
      source: '../src/b.js',
      content: `b\n${second}`,
      current: `b\n${second}`,
    },
  ]);
  const audit = buildAudit(context);
  assert.equal(audit.summary.pathCollisions, 1);
  assert.equal(audit.summary.ambiguousMappings, 1);

  const result = applyRecovery(audit, {
    overwriteModified: false,
    manifestPath: path.join(context.outDir, 'manifest.json'),
    repositoryRoot: context.root,
  });
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.skippedAmbiguous, ['src/shared.ts']);
  assert.equal(fs.existsSync(path.join(context.outDir, 'src/shared.ts')), false);
});

test('reports missing sourcesContent and malformed inline maps', () => {
  const withoutContent = inlineMap(nestedMap(['missing.ts'], []));
  const malformed =
    '//# sourceMappingURL=data:application/json;base64,not-valid-***';
  const context = fixture([
    {
      source: '../src/a.js',
      content: `a\n${withoutContent}`,
      current: `a\n${withoutContent}`,
    },
    {
      source: '../src/b.js',
      content: `b\n${malformed}`,
      current: `b\n${malformed}`,
    },
  ]);
  const audit = buildAudit(context);

  assert.equal(audit.summary.inlineMapsFound, 2);
  assert.equal(audit.summary.validNestedMaps, 1);
  assert.equal(audit.summary.invalidNestedMaps, 1);
  assert.equal(audit.summary.nestedSourcesWithoutContent, 1);
});

test('rejects absolute and traversal paths', () => {
  assert.throws(
    () => resolveNestedDestination('src/out.js', '', '../secret.ts'),
    /path traversal/,
  );
  assert.throws(
    () => resolveNestedDestination('src/out.js', '', '/secret.ts'),
    /absolute/,
  );
  assert.throws(() => resolveOuterDestination('../../secret.ts'), /path traversal/);
  assert.equal(
    resolveNestedDestination('src/out.js', './', './safe.ts'),
    'src/safe.ts',
  );
  assert.equal(resolveOuterDestination('../src/safe.ts'), 'src/safe.ts');
});

test('skips locally modified files unless overwrite is explicitly approved', () => {
  const original = 'const value: number = 1\n';
  const compiled = `const value = 1;\n${inlineMap(
    nestedMap(['A.ts'], [original]),
  )}`;
  const context = fixture([
    {
      source: '../src/A.ts',
      content: compiled,
      current: 'const locallyEdited = true\n',
    },
  ]);
  const audit = buildAudit(context);
  assert.deepEqual(audit.locallyModifiedFiles, ['src/A.ts']);

  const skipped = applyRecovery(audit, {
    overwriteModified: false,
    manifestPath: path.join(context.outDir, 'first-manifest.json'),
    repositoryRoot: context.root,
  });
  assert.deepEqual(skipped.skippedModified, ['src/A.ts']);
  assert.equal(
    fs.readFileSync(path.join(context.outDir, 'src/A.ts'), 'utf8'),
    'const locallyEdited = true\n',
  );

  const approved = applyRecovery(audit, {
    overwriteModified: true,
    manifestPath: path.join(context.outDir, 'second-manifest.json'),
    repositoryRoot: context.root,
  });
  assert.deepEqual(approved.written, ['src/A.ts']);
  assert.equal(
    fs.readFileSync(path.join(context.outDir, 'src/A.ts'), 'utf8'),
    original,
  );
});

test('rechecks a destination immediately before writing', () => {
  const original = 'const value: number = 1\n';
  const compiled = `const value = 1;\n${inlineMap(
    nestedMap(['A.ts'], [original]),
  )}`;
  const context = fixture([
    {
      source: '../src/A.ts',
      content: compiled,
      current: compiled,
    },
  ]);
  const audit = buildAudit(context);
  fs.writeFileSync(
    path.join(context.outDir, 'src/A.ts'),
    'const editAfterAudit = true\n',
  );

  const result = applyRecovery(audit, {
    overwriteModified: false,
    manifestPath: path.join(context.outDir, 'manifest.json'),
    repositoryRoot: context.root,
  });
  assert.deepEqual(result.skippedModified, ['src/A.ts']);
  assert.equal(
    fs.readFileSync(path.join(context.outDir, 'src/A.ts'), 'utf8'),
    'const editAfterAudit = true\n',
  );
});

test('CLI write mode cannot target released package files', () => {
  const repositoryRoot = path.resolve(__dirname, '..');
  assert.throws(
    () =>
      parseArguments(
        ['--write', '--out-dir', path.join(repositoryRoot, 'package')],
        repositoryRoot,
      ),
    /restored-src research workspace/,
  );
  assert.throws(
    () =>
      parseArguments(
        [
          '--write',
          '--manifest',
          path.join(repositoryRoot, 'package', 'cli.js.map'),
        ],
        repositoryRoot,
      ),
    /manifest must stay/,
  );
});
