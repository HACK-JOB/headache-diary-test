// Usage: node scripts/publish-notes.mjs [YYYY-MM-DD]
// Moves notes/drafts.json into the next numbered update in js/releases.js, then empties the drafts.
import { readFileSync, writeFileSync } from 'node:fs';
import { publish, validate } from '../js/patchnotes.js';
import { RELEASES } from '../js/releases.js';

const drafts = JSON.parse(readFileSync(new URL('../notes/drafts.json', import.meta.url), 'utf8'));
const problems = validate(drafts);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const out = publish(RELEASES, drafts, date);
writeFileSync(new URL('../js/releases.js', import.meta.url),
  `// Published patch notes. Written by scripts/publish-notes.mjs; do not edit by hand.\nexport const RELEASES = ${JSON.stringify(out.releases, null, 2)};\n`);
writeFileSync(new URL('../notes/drafts.json', import.meta.url), '[]\n');
console.log(`Published ${out.releases.at(-1).title} with ${drafts.length} notes (${date}).`);
