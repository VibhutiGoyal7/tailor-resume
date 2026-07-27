// BullMQ worker entrypoint (build brief Section 1 & 7). A plain long-running
// Node process — separate deployable from `web`, sharing the same Prisma client
// and module facades. Each stage gets its own Worker so concurrency can be
// tuned per stage.
import { Worker, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES } from './queues.js';
import { parseJD } from './tasks/parseJD.js';
import { retrieveCandidates } from './tasks/retrieveCandidates.js';
import { generateResume } from './tasks/generateResume.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function startWorker(): Worker[] {
  const connection = new Redis(requireEnv('REDIS_URL'), {
    maxRetriesPerRequest: null, // required by BullMQ
  });

  const stages: Array<{ name: string; processor: Processor }> = [
    { name: QUEUE_NAMES.parse, processor: (job) => parseJD(job.data) },
    { name: QUEUE_NAMES.retrieve, processor: (job) => retrieveCandidates(job.data) },
    { name: QUEUE_NAMES.generate, processor: (job) => generateResume(job.data) },
  ];

  const workers = stages.map(
    ({ name, processor }) => new Worker(name, processor, { connection, concurrency: 1 }),
  );

  // eslint-disable-next-line no-console
  console.log(`[worker] started; listening on ${stages.map((s) => s.name).join(', ')}`);
  return workers;
}

// Only start when run directly (`node dist/index.js` / `tsx src/index.ts`),
// not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
