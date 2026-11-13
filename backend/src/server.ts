import 'dotenv/config';
import { createServer } from 'node:http';
import { app } from './app.js';
import { db } from './db.js';
import { seedDatabase } from './seed.js';
import { attachTelemetry } from './telemetry.js';

const port = Number(process.env.PORT ?? 8000);
if (process.env.NODE_ENV !== 'production') await seedDatabase();
const server = createServer(app);
attachTelemetry(server);
server.listen(port,()=>console.log(`VerifyMart API listening on http://localhost:${port}`));
const shutdown = (signal:string) => {
  console.log(`${signal} received; shutting down gracefully.`);
  server.close(()=>{ db.close(); process.exit(0); });
  setTimeout(()=>process.exit(1),10_000).unref();
};
process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));
