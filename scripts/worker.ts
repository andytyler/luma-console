import { runNextEnrichmentJob } from '../src/lib/server/enrichment';
import { sql } from '../src/lib/server/db';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('Enrichment worker started.');

let shuttingDown = false;
process.on('SIGINT', () => {
  shuttingDown = true;
});
process.on('SIGTERM', () => {
  shuttingDown = true;
});

while (!shuttingDown) {
  const result = await runNextEnrichmentJob();
  if (result) {
    console.log(`[${new Date().toISOString()}] ${result.type} ${result.status}`);
  } else {
    await sleep(3000);
  }
}

await sql.end();
console.log('Enrichment worker stopped.');
