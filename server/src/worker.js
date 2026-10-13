import 'dotenv/config';
import { start, stop } from './infrastructure/worker/grading-worker.js';

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

start();
