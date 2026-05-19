// src/index.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import reportRoutes from './routes/reports.js';
import trackRoutes from './routes/track.js';
import './workers/checkWorker.js'; // Start worker

import cron from 'node-cron';
import { query } from './db/pool.js';
import { checkQueue } from './workers/checkWorker.js';

const app = express();
app.set('trust proxy', 1); // ← ADD THIS LINE
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.use('/api/track', rateLimit({ windowMs: 60000, max: 200 }));
app.use('/api/auth', rateLimit({ windowMs: 60000, max: 20 }));
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// ─── Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/track', trackRoutes);

app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Scheduled re-checks ─────────────────────────────────────────
cron.schedule('0 6 * * *', async () => {
  console.log('🕐 Running scheduled re-checks...');
  const { rows } = await query(`
    SELECT id FROM projects
    WHERE (
      (check_frequency='daily' AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '1 day'))
      OR (check_frequency='weekly' AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '7 days'))
      OR (check_frequency='biweekly' AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '14 days'))
      OR (check_frequency='monthly' AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '30 days'))
    )
  `);

  for (const project of rows) {
    const { rows: [run] } = await query(
      `INSERT INTO check_runs (project_id, status) VALUES ($1,'queued') RETURNING id`,
      [project.id]
    );
    await checkQueue.add('scheduled-check', { checkRunId: run.id, projectId: project.id });
  }
  console.log(`Queued ${rows.length} scheduled checks`);
});

// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 AI Visibility API running on port ${PORT}`);
});
