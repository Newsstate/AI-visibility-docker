// src/routes/reports.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

// Get full report for a project (latest run)
router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { projectId } = req.params;

  // Verify ownership
  const { rows: [project] } = await query(
    `SELECT * FROM projects WHERE id=$1 AND user_id=$2`,
    [projectId, req.user.userId]
  );
  if (!project) return res.status(404).json({ error: 'Not found' });

  // Latest completed run
  const { rows: [latestRun] } = await query(`
    SELECT * FROM check_runs
    WHERE project_id=$1 AND status='completed'
    ORDER BY completed_at DESC LIMIT 1
  `, [projectId]);

  if (!latestRun) return res.json({ project, hasData: false });

  // Platform scores
  const { rows: platformScores } = await query(`
    SELECT
      platform,
      AVG(avg_rank_score) as avg_score,
      AVG(consistency_pct) as avg_consistency,
      COUNT(*) FILTER (WHERE best_rank_tier='primary') as primary_count,
      COUNT(*) FILTER (WHERE best_rank_tier='top') as top_count,
      COUNT(*) FILTER (WHERE best_rank_tier='mentioned') as mentioned_count,
      COUNT(*) FILTER (WHERE best_rank_tier='buried') as buried_count,
      COUNT(*) FILTER (WHERE best_rank_tier='absent') as absent_count,
      COUNT(*) as total
    FROM prompt_scores
    WHERE check_run_id=$1
    GROUP BY platform
    ORDER BY avg_score DESC
  `, [latestRun.id]);

  // Prompt results with details
  const { rows: promptResults } = await query(`
    SELECT
      p.id, p.text, p.category, p.source,
      json_object_agg(ps.platform, json_build_object(
        'tier', ps.best_rank_tier,
        'score', ps.avg_rank_score,
        'consistency', ps.consistency_pct,
        'clicks', ps.clicks
      )) as platforms
    FROM prompts p
    LEFT JOIN prompt_scores ps ON ps.prompt_id = p.id AND ps.check_run_id=$1
    WHERE p.project_id=$2 AND p.is_active=true
    GROUP BY p.id, p.text, p.category, p.source
    ORDER BY p.source DESC, p.category ASC
  `, [latestRun.id, projectId]);

  // Clicks by platform (this month)
  const { rows: clicksByPlatform } = await query(`
    SELECT ai_source, COUNT(*) as clicks
    FROM click_events
    WHERE project_id=$1
      AND created_at >= date_trunc('month', NOW())
    GROUP BY ai_source
    ORDER BY clicks DESC
  `, [projectId]);

  // Click journey
  const { rows: clickJourney } = await query(`
    SELECT ai_source, landing_page, COUNT(*) as clicks
    FROM click_events
    WHERE project_id=$1
      AND created_at >= date_trunc('month', NOW())
    GROUP BY ai_source, landing_page
    ORDER BY clicks DESC LIMIT 10
  `, [projectId]);

  // GEO score history (last 6 runs)
  const { rows: scoreHistory } = await query(`
    SELECT geo_score, completed_at
    FROM check_runs
    WHERE project_id=$1 AND status='completed'
    ORDER BY completed_at DESC LIMIT 6
  `, [projectId]);

  // Recommendations
  const { rows: recommendations } = await query(`
    SELECT * FROM recommendations
    WHERE check_run_id=$1
    ORDER BY priority DESC
  `, [latestRun.id]);

  // Total AI clicks
  const { rows: [clickTotals] } = await query(`
    SELECT
      COUNT(*) as total_clicks,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as this_month,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days'
                         AND created_at < NOW() - INTERVAL '30 days') as last_month
    FROM click_events
    WHERE project_id=$1
  `, [projectId]);

  const clickChange = clickTotals.last_month > 0
    ? Math.round(((clickTotals.this_month - clickTotals.last_month) / clickTotals.last_month) * 100)
    : null;

  res.json({
    project,
    run: latestRun,
    hasData: true,
    platformScores,
    promptResults,
    clicksByPlatform,
    clickJourney,
    scoreHistory: scoreHistory.reverse(),
    recommendations,
    metrics: {
      totalClicks: parseInt(clickTotals.this_month) || 0,
      clickChange,
      platformsVisible: platformScores.filter(p => p.avg_score > 10).length,
      totalPlatforms: 5,
      primaryCount: platformScores.reduce((s, p) => s + parseInt(p.primary_count), 0),
      promptsTracked: promptResults.length
    }
  });
});

// SSE: live progress for a check run
router.get('/runs/:runId/progress', requireAuth, async (req, res) => {
  const { runId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Poll DB every 2s
  const interval = setInterval(async () => {
    const { rows: [run] } = await query(
      `SELECT * FROM check_runs WHERE id=$1`, [runId]
    );
    if (!run) { clearInterval(interval); res.end(); return; }

    send({
      status: run.status,
      completed: run.completed_queries,
      total: run.total_queries,
      pct: run.total_queries > 0
        ? Math.round((run.completed_queries / run.total_queries) * 100)
        : 0
    });

    if (run.status === 'completed' || run.status === 'failed') {
      clearInterval(interval);
      setTimeout(() => res.end(), 1000);
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

// Check run status
router.get('/runs/:runId', requireAuth, async (req, res) => {
  const { rows: [run] } = await query(
    `SELECT * FROM check_runs WHERE id=$1`, [req.params.runId]
  );
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

export default router;
