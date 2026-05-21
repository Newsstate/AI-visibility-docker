// src/routes/projects.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { crawlWebsite, getDomain } from '../services/crawler.js';
import { analyzeWebsite, generatePrompts } from '../services/analyzer.js';
import { checkQueue } from '../workers/checkWorker.js';

const router = Router();

// ─── List projects ───────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, cr.geo_score, cr.completed_at as last_run_at
     FROM projects p
     LEFT JOIN LATERAL (
       SELECT geo_score, completed_at FROM check_runs
       WHERE project_id = p.id AND status='completed'
       ORDER BY completed_at DESC LIMIT 1
     ) cr ON true
     WHERE p.user_id=$1 ORDER BY p.created_at DESC`,
    [req.user.userId]
  );
  res.json(rows);
});

// ─── Scan simple (GET — used by frontend, supports auth header) ──
router.get('/scan-simple', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const domain = getDomain(url);
    const pages = await crawlWebsite(url);
    const analysis = await analyzeWebsite(pages);
    const prompts = await generatePrompts(analysis);
    res.json({ analysis, prompts, domain });
  } catch (err) {
    console.error('Scan-simple error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Scan website SSE (POST — kept for future use) ───────────────
router.post('/scan', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const domain = getDomain(url);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL
    });

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    send({ step: 'crawling', message: 'Crawling website pages...' });
    const pages = await crawlWebsite(url);
    send({ step: 'crawled', message: `Crawled ${pages.length} pages`, pageCount: pages.length });

    send({ step: 'analyzing', message: 'Extracting niche and services...' });
    const analysis = await analyzeWebsite(pages);
    send({ step: 'analyzed', message: 'Analysis complete', analysis });

    send({ step: 'generating', message: 'Generating 16 tracking prompts...' });
    const prompts = await generatePrompts(analysis);
    send({ step: 'complete', message: 'Ready to launch', analysis, prompts, domain });

    res.end();
  } catch (err) {
    console.error('Scan error:', err);
    res.write(`data: ${JSON.stringify({ step: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ─── Create project + prompts + launch check run ─────────────────
router.post('/', requireAuth, async (req, res) => {
  const { url, analysis, prompts, manualKeywords = [], checkFrequency = 'weekly', selectedPlatforms } = req.body;
  if (!url || !analysis) return res.status(400).json({ error: 'URL and analysis required' });

  try {
    const domain = getDomain(url);

    const { rows: [project] } = await query(`
      INSERT INTO projects
        (user_id, url, domain, brand_name, niche, target_audience, services, competitors, geo_signals, check_frequency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      req.user.userId, url, domain,
      analysis.brand_name, analysis.niche, analysis.target_audience,
      JSON.stringify(Array.isArray(analysis.services) ? analysis.services : []),
      JSON.stringify(Array.isArray(analysis.competitors) ? analysis.competitors : []),
      JSON.stringify(Array.isArray(analysis.geo_signals) ? analysis.geo_signals : []),
      checkFrequency
    ]);

    const allPrompts = [
      ...(prompts || []).map(p => ({ ...p, source: 'auto' })),
      ...(manualKeywords || []).filter(k => k.trim()).map(k => ({ text: k, category: null, source: 'manual' }))
    ];

    for (const p of allPrompts) {
      await query(
        `INSERT INTO prompts (project_id, text, category, source) VALUES ($1,$2,$3,$4)`,
        [project.id, p.text, p.category, p.source]
      );
    }

   const { rows: [run] } = await query(
  `INSERT INTO check_runs (project_id, status) VALUES ($1,'queued') RETURNING *`,
  [project.id]
);

await checkQueue.add('run-checks', {
  checkRunId: run.id,
  projectId: project.id,
  selectedPlatforms: selectedPlatforms || null, // null = use all platforms
}, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 }
    });

    res.json({ project, checkRunId: run.id });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ─── Get single project ──────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM projects WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ─── Trigger manual re-check ─────────────────────────────────────
router.post('/:id/check', requireAuth, async (req, res) => {
  const { rows: [project] } = await query(
    `SELECT * FROM projects WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.userId]
  );
  if (!project) return res.status(404).json({ error: 'Not found' });

  const { rows: [run] } = await query(
    `INSERT INTO check_runs (project_id, status) VALUES ($1,'queued') RETURNING *`,
    [project.id]
  );

  await checkQueue.add('run-checks', { checkRunId: run.id, projectId: project.id });
  res.json({ checkRunId: run.id });
});

// ─── Add manual prompts to existing project ──────────────────────
router.post('/:id/prompts', requireAuth, async (req, res) => {
  const { prompts } = req.body;
  const { rows: [project] } = await query(
    `SELECT id FROM projects WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.userId]
  );
  if (!project) return res.status(404).json({ error: 'Not found' });

  const inserted = [];
  for (const text of (prompts || [])) {
    if (!text?.trim()) continue;
    const { rows: [p] } = await query(
      `INSERT INTO prompts (project_id, text, source) VALUES ($1,$2,'manual') RETURNING *`,
      [project.id, text.trim()]
    );
    inserted.push(p);
  }
  res.json(inserted);
});

export default router;
