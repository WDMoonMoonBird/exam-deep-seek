import 'dotenv/config';
import { start, stop } from './services/gradingWorker.js';

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

start();
