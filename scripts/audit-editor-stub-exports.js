#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TYPESCRIPT_COMMAND = [
  'npx',
  '--yes',
  '-p',
  'typescript@5.9.3',
  'tsc',
  '--noEmit',
  '--project',
  'restored-src/tsconfig.json',
  '--pretty',
  'false',
];
const EDITOR_DECLARATION_MARKER = 'Editor-only declaration';
const NAMESPACE_MEMBER_DIAGNOSTIC =
  /^(.*?)\((\d+),(\d+)\): error TS2339: Property '([^']+)' does not exist on type 'typeof import\("([^"]+)"\)'\.?$/;
const SOURCE_EXTENSIONS = ['.d.ts', '.ts', '.tsx', '.js', '.jsx'];

function toPosix(value) {
  return value.replaceAll(path.sep, '/');
}

function parseArguments(argv, repositoryRoot) {
  const options = {
    fix: false,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--fix') {
      options.fix = true;
    } else if (argument === '--output') {
      const value = argv[index + 1];
      if (!value) throw new Error('--output requires a path');
      index += 1;
      options.output = path.resolve(repositoryRoot, value);
    } else if (argument === '--help') {
      options.help = true;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/audit-editor-stub-exports.js [options]

Runs the repository's TypeScript check and audits TS2339 diagnostics caused by
missing properties on module namespace types.

Options:
  --fix          Append exact missing value exports to eligible editor-only .d.ts stubs
  --output PATH  Write the deterministic JSON audit to PATH
  --help         Show this help
`;
}

function runTypeScriptAudit(repositoryRoot) {
  const result = spawnSync(TYPESCRIPT_COMMAND[0], TYPESCRIPT_COMMAND.slice(1), {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    exitCode: result.status,
    output,
  };
}

function resolveLocalModule(moduleName, restoredRoot) {
  const absoluteModule = path.resolve(moduleName);
  const relative = path.relative(restoredRoot, absoluteModule);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const filename = `${absoluteModule}${extension}`;
    if (fs.existsSync(filename)) return filename;
  }
  return null;
}

function classifyModule(moduleName, restoredRoot) {
  const filename = resolveLocalModule(moduleName, restoredRoot);
  if (!filename) {
    return {
      classification: 'external-or-unresolved',
      declarationFile: null,
    };
  }

  if (filename.endsWith('.d.ts')) {
    const content = fs.readFileSync(filename, 'utf8');
    return {
      classification: content
        .slice(0, 500)
        .includes(EDITOR_DECLARATION_MARKER)
        ? 'eligible-editor-declaration'
        : 'other-local-declaration',
      declarationFile: filename,
    };
  }
  return {
    classification: 'recovered-implementation',
    declarationFile: null,
  };
}

function buildAudit(repositoryRoot) {
  const restoredRoot = path.join(repositoryRoot, 'restored-src');
  const typeScript = runTypeScriptAudit(repositoryRoot);
  const allDiagnostics = [
    ...typeScript.output.matchAll(/error TS(\d+):/g),
  ];
  const grouped = new Map();

  for (const line of typeScript.output.split('\n')) {
    const match = line.match(NAMESPACE_MEMBER_DIAGNOSTIC);
    if (!match) continue;
    const [, siteFile, lineNumber, columnNumber, member, moduleName] = match;
    const moduleInfo = classifyModule(moduleName, restoredRoot);
    const moduleKey = moduleInfo.declarationFile
      ? toPosix(path.relative(repositoryRoot, moduleInfo.declarationFile))
      : moduleName.startsWith(repositoryRoot)
        ? toPosix(path.relative(repositoryRoot, moduleName))
        : moduleName;
    const absoluteSiteFile = path.isAbsolute(siteFile)
      ? siteFile
      : path.resolve(repositoryRoot, siteFile);
    const entry = grouped.get(moduleKey) || {
      module: moduleKey,
      classification: moduleInfo.classification,
      declarationFile: moduleInfo.declarationFile
        ? toPosix(path.relative(repositoryRoot, moduleInfo.declarationFile))
        : null,
      diagnosticCount: 0,
      missingExports: new Set(),
      sites: [],
    };
    entry.diagnosticCount += 1;
    entry.missingExports.add(member);
    entry.sites.push({
      file: toPosix(path.relative(repositoryRoot, absoluteSiteFile)),
      line: Number(lineNumber),
      column: Number(columnNumber),
      member,
    });
    grouped.set(moduleKey, entry);
  }

  const entries = [...grouped.values()]
    .map((entry) => ({
      ...entry,
      missingExports: [...entry.missingExports].sort(),
      sites: entry.sites.sort(
        (left, right) =>
          left.file.localeCompare(right.file) ||
          left.line - right.line ||
          left.column - right.column ||
          left.member.localeCompare(right.member),
      ),
    }))
    .sort((left, right) => left.module.localeCompare(right.module));
  const eligibleEntries = entries.filter(
    (entry) => entry.classification === 'eligible-editor-declaration',
  );

  return {
    schemaVersion: 1,
    command: TYPESCRIPT_COMMAND.join(' '),
    typescriptExitCode: typeScript.exitCode,
    summary: {
      totalTypeScriptDiagnostics: allDiagnostics.length,
      namespaceMemberDiagnostics: entries.reduce(
        (total, entry) => total + entry.diagnosticCount,
        0,
      ),
      modulesWithMissingNamespaceMembers: entries.length,
      uniqueMissingNamespaceMembers: entries.reduce(
        (total, entry) => total + entry.missingExports.length,
        0,
      ),
      eligibleEditorDeclarationModules: eligibleEntries.length,
      eligibleMissingExports: eligibleEntries.reduce(
        (total, entry) => total + entry.missingExports.length,
        0,
      ),
      recoveredImplementationModules: entries.filter(
        (entry) => entry.classification === 'recovered-implementation',
      ).length,
      externalOrUnresolvedModules: entries.filter(
        (entry) => entry.classification === 'external-or-unresolved',
      ).length,
    },
    entries,
  };
}

function declarationAlreadyExists(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\bexport\\s+(?:declare\\s+)?(?:const|let|var|function|class)\\s+${escaped}\\b`,
  ).test(content);
}

function atomicWrite(filename, content) {
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.stub-export-audit-${process.pid}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, content, 'utf8');
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

function applyEligibleFixes(audit, repositoryRoot) {
  const changedFiles = [];
  const addedExports = [];
  for (const entry of audit.entries) {
    if (entry.classification !== 'eligible-editor-declaration') continue;
    const filename = path.resolve(repositoryRoot, entry.declarationFile);
    let content = fs.readFileSync(filename, 'utf8');
    if (!content.slice(0, 500).includes(EDITOR_DECLARATION_MARKER)) {
      throw new Error(
        `refusing to edit declaration without editor-only marker: ${entry.declarationFile}`,
      );
    }

    const declarations = [];
    for (const name of entry.missingExports) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        throw new Error(`unsupported export identifier: ${name}`);
      }
      if (declarationAlreadyExists(content, name)) continue;
      declarations.push(`export const ${name}: any`);
      addedExports.push({
        declarationFile: entry.declarationFile,
        name,
      });
    }
    if (declarations.length === 0) continue;
    if (!content.endsWith('\n')) content += '\n';
    content += `${declarations.join('\n')}\n`;
    atomicWrite(filename, content);
    changedFiles.push(entry.declarationFile);
  }
  return {
    changedFiles: changedFiles.sort(),
    addedExports: addedExports.sort(
      (left, right) =>
        left.declarationFile.localeCompare(right.declarationFile) ||
        left.name.localeCompare(right.name),
    ),
  };
}

function writeAudit(filename, audit) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  atomicWrite(filename, `${JSON.stringify(audit, null, 2)}\n`);
}

function main() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const options = parseArguments(process.argv.slice(2), repositoryRoot);
  if (options.help) {
    console.log(usage());
    return;
  }

  const audit = buildAudit(repositoryRoot);
  if (options.output) writeAudit(options.output, audit);
  console.log(JSON.stringify(audit.summary, null, 2));

  if (options.fix) {
    const result = applyEligibleFixes(audit, repositoryRoot);
    console.log(
      JSON.stringify(
        {
          changedFiles: result.changedFiles.length,
          addedExports: result.addedExports.length,
        },
        null,
        2,
      ),
    );
  }
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
  applyEligibleFixes,
  buildAudit,
  classifyModule,
  parseArguments,
};
