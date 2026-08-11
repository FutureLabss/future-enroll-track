#!/usr/bin/env node
// Lints only the lines actually added/changed vs. the base branch — not
// whole files. A whole-file gate would fail on any legacy file someone
// touches even for a one-line change, since pre-existing debt in the rest
// of that file would get blamed on the new diff. Line-precise avoids that.
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';

const BASE_REF = process.env.BASE_REF || 'origin/main';

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

function resolveBaseRef() {
  try {
    sh('git', ['fetch', 'origin', 'main', '--quiet']);
  } catch {
    // offline or no origin — fall through to local ref resolution
  }
  for (const ref of [BASE_REF, 'main']) {
    try {
      sh('git', ['rev-parse', '--verify', ref]);
      return ref;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function changedFiles(mergeBase) {
  const out = sh('git', ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase}...HEAD`, '--', '*.ts', '*.tsx']);
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Maps each changed file to the set of line numbers that were added/changed,
// parsed from unified diff hunk headers: @@ -a,b +c,d @@
function changedLines(mergeBase, file) {
  const diff = sh('git', ['diff', '-U0', `${mergeBase}...HEAD`, '--', file]);
  const lines = new Set();
  for (const line of diff.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!m) continue;
    const start = parseInt(m[1], 10);
    const count = m[2] === undefined ? 1 : parseInt(m[2], 10);
    for (let i = 0; i < count; i++) lines.add(start + i);
  }
  return lines;
}

async function main() {
  const mergeBaseRef = resolveBaseRef();
  if (!mergeBaseRef) {
    console.log('No base ref found to diff against — skipping changed-lines lint.');
    return;
  }

  const mergeBase = sh('git', ['merge-base', mergeBaseRef, 'HEAD']).trim();
  const files = changedFiles(mergeBase);

  if (files.length === 0) {
    console.log('No changed TS/TSX files to lint.');
    return;
  }

  const eslint = new ESLint();
  const results = await eslint.lintFiles(files);

  let failing = 0;
  for (const result of results) {
    const lines = changedLines(mergeBase, result.filePath.replace(process.cwd() + '/', ''));
    const relevant = result.messages.filter((m) => lines.has(m.line));
    if (relevant.length === 0) continue;
    console.log(`\n${result.filePath}`);
    for (const m of relevant) {
      const kind = m.severity === 2 ? 'error' : 'warning';
      console.log(`  ${m.line}:${m.column}  ${kind}  ${m.message}  (${m.ruleId})`);
      if (m.severity === 2) failing++;
    }
  }

  if (failing > 0) {
    console.log(`\n${failing} error(s) on changed lines.`);
    process.exit(1);
  }
  console.log('No lint errors on changed lines.');
}

main();
