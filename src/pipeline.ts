/**
 * Runs the automated steps of the pipeline.
 * Step 3 (classify) is intentionally skipped — it's handled by your AI assistant.
 * See CLAUDE.md for instructions on how to classify channels with your AI.
 */
import { execSync } from 'child_process';

const steps = [
  { name: 'ingest',  cmd: 'tsx src/ingest/index.ts' },
  { name: 'enrich',  cmd: 'tsx src/enrich/index.ts' },
  { name: 'report',  cmd: 'tsx src/report/index.ts' },
];

for (const step of steps) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`STEP: ${step.name.toUpperCase()}`);
  console.log('='.repeat(50));
  execSync(step.cmd, { stdio: 'inherit' });
}

console.log('\n' + '='.repeat(50));
console.log('STEP: CLASSIFY (manual — AI-assisted)');
console.log('='.repeat(50));
console.log('Run: npm run classify:prepare');
console.log('Then ask your AI assistant to classify output/to_classify.md');
console.log('Then run: npm run classify:apply');
console.log('Then run: npm run report  (to regenerate the report with categories)');
