import { execSync } from 'child_process';

const steps = [
  { name: 'ingest',   cmd: 'tsx src/ingest/index.ts' },
  { name: 'enrich',   cmd: 'tsx src/enrich/index.ts' },
  { name: 'classify', cmd: 'tsx src/classify/index.ts' },
  { name: 'report',   cmd: 'tsx src/report/index.ts' },
];

for (const step of steps) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`STEP: ${step.name.toUpperCase()}`);
  console.log('='.repeat(50));
  execSync(step.cmd, { stdio: 'inherit' });
}

console.log('\nPipeline completo.');
