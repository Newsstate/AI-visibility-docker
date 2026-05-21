// src/routes/admin.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';

const router = Router();

// ─── Admin guard middleware ───────────────────────────────────────
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

function requireAdmin(req, res, next) {
  if (!ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── Cost constants per API call ─────────────────────────────────
const COST_PER_CALL = {
  chatgpt:     0.000150,  // gpt-4o-mini: $0.15 per 1M input tokens avg ~1000 tokens = $0.00015
  perplexity:  0.000200,  // sonar: ~$0.20 per 1M tokens
  gemini:      0.000075,  // gemini-1.5-flash: $0.075 per 1M tokens
  claude:      0.000080,  // claude-haiku: $0.08 per 1M tokens
  ai_overview: 0.005000,  // SerpAPI: $50/5000 = $0.01 per search (avg 2 searches per call)
};

const ANALYSIS_COST = 0.003;     // Claude Sonnet for website analysis (~$0.003)
const PROMPTS_COST  = 0.004;     // Claude Sonnet for prompt generation (~$0.004)
const RECS_COST     = 0.005;     // Claude Sonnet for recommendations (~$0.005)

// ─── Helper: calculate run cost ───────────────────────────────────
function calcRunCost(totalQueries, platforms) {
  // Distribute queries equally across platforms
  const perPlatform = Math.round(totalQueries / 5);
  let cost = 0;
  for (const [platform, costPerCall] of Object.entries(COST_PER_CALL)) {
    cost += perPlatform * costPerCall;
  }
  cost += ANALYSIS_COST + PROMPTS_COST + RECS_COST;
  return Math.round(cost * 10000) / 10000;
}

// ─── GET /api/admin/overview ──────────────────────────────────────
// Main dashboard stats
router.get('/overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [
      usersResult,
      projectsResult,
      runsResult,
      todayRunsResult,
      platformResult,
      recentRunsResult,
      topUsersResult,
    ] = await Promise.all([

      // Total users
      query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
        FROM users`),

      // Total projects
      query(`SELECT COUNT(*) as total FROM projects`),

      // All check runs stats
      query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COUNT(*) FILTER (WHERE status='running') as running,
        COUNT(*) FILTER (WHERE status='queued') as queued,
        COALESCE(SUM(total_queries),0) as total_queries,
        COALESCE(AVG(geo_score) FILTER (WHERE status='completed'), 0) as avg_geo_score,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as runs_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as runs_this_week
        FROM check_runs`),

      // Runs by day last 14 days
      query(`SELECT
        DATE(created_at) as date,
        COUNT(*) as runs,
        COALESCE(SUM(total_queries), 0) as queries
        FROM check_runs
        WHERE created_at > NOW() - INTERVAL '14 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC`),

      // Queries per platform (from prompt_results)
      query(`SELECT platform, COUNT(*) as calls
        FROM prompt_results
        GROUP BY platform
        ORDER BY calls DESC`),

      // Recent 20 runs with user info
      query(`SELECT
        cr.id, cr.status, cr.total_queries, cr.completed_queries,
        cr.geo_score, cr.created_at, cr.completed_at,
        p.domain, p.brand_name,
        u.email, u.name
        FROM check_runs cr
        JOIN projects p ON cr.project_id = p.id
        JOIN users u ON p.user_id = u.id
        ORDER BY cr.created_at DESC
        LIMIT 20`),

      // Top users by run count
      query(`SELECT
        u.id, u.email, u.name, u.plan, u.created_at,
        COUNT(DISTINCT p.id) as projects,
        COUNT(DISTINCT cr.id) as runs,
        COALESCE(SUM(cr.total_queries), 0) as total_queries
        FROM users u
        LEFT JOIN projects p ON p.user_id = u.id
        LEFT JOIN check_runs cr ON cr.project_id = p.id
        GROUP BY u.id, u.email, u.name, u.plan, u.created_at
        ORDER BY runs DESC
        LIMIT 20`),
    ]);

    // Calculate estimated costs
    const totalQueries  = parseInt(runsResult.rows[0].total_queries) || 0;
    const totalRuns     = parseInt(runsResult.rows[0].completed) || 0;
    const estimatedCost = totalRuns * calcRunCost(totalQueries / Math.max(totalRuns, 1), 5);

    // Per-platform cost estimates
    const platformCosts = platformResult.rows.map(r => ({
      platform: r.platform,
      calls:    parseInt(r.calls),
      cost:     Math.round(parseInt(r.calls) * (COST_PER_CALL[r.platform] || 0.0001) * 10000) / 10000,
    }));

    // Enrich recent runs with cost estimate
    const enrichedRuns = recentRunsResult.rows.map(r => ({
      ...r,
      estimated_cost: calcRunCost(parseInt(r.total_queries) || 0, 5),
      duration_secs: r.completed_at && r.created_at
        ? Math.round((new Date(r.completed_at) - new Date(r.created_at)) / 1000)
        : null,
    }));

    res.json({
      users:         usersResult.rows[0],
      projects:      projectsResult.rows[0],
      runs:          runsResult.rows[0],
      runsByDay:     todayRunsResult.rows,
      platformCalls: platformCosts,
      recentRuns:    enrichedRuns,
      topUsers:      topUsersResult.rows,
      costs: {
        total_estimated:    Math.round(estimatedCost * 100) / 100,
        per_run_avg:        totalRuns > 0 ? Math.round((estimatedCost / totalRuns) * 10000) / 10000 : 0,
        per_platform:       platformCosts,
        analysis_per_scan:  ANALYSIS_COST + PROMPTS_COST,
        recs_per_run:       RECS_COST,
        breakdown: {
          chatgpt:     Math.round((platformCosts.find(p => p.platform === 'chatgpt')?.cost || 0) * 100) / 100,
          perplexity:  Math.round((platformCosts.find(p => p.platform === 'perplexity')?.cost || 0) * 100) / 100,
          gemini:      Math.round((platformCosts.find(p => p.platform === 'gemini')?.cost || 0) * 100) / 100,
          claude:      Math.round((platformCosts.find(p => p.platform === 'claude')?.cost || 0) * 100) / 100,
          ai_overview: Math.round((platformCosts.find(p => p.platform === 'ai_overview')?.cost || 0) * 100) / 100,
        }
      }
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/domain/:domain ───────────────────────────────
// Cost breakdown for a specific domain
router.get('/domain/:domain', requireAuth, requireAdmin, async (req, res) => {
  const { domain } = req.params;
  try {
    const { rows: projects } = await query(
      `SELECT p.*, u.email, u.name FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.domain ILIKE $1`,
      [`%${domain}%`]
    );

    if (!projects.length) return res.status(404).json({ error: 'Domain not found' });

    const projectIds = projects.map(p => `'${p.id}'`).join(',');

    const [runsResult, platformResult] = await Promise.all([
      query(`SELECT cr.*,
        p.domain, p.brand_name
        FROM check_runs cr
        JOIN projects p ON cr.project_id = p.id
        WHERE cr.project_id IN (${projectIds})
        ORDER BY cr.created_at DESC`),

      query(`SELECT pr.platform, COUNT(*) as calls
        FROM prompt_results pr
        JOIN check_runs cr ON pr.check_run_id = cr.id
        WHERE cr.project_id IN (${projectIds})
        GROUP BY pr.platform`),
    ]);

    const runs = runsResult.rows.map(r => ({
      ...r,
      estimated_cost: calcRunCost(parseInt(r.total_queries) || 0, 5),
    }));

    const totalCost = runs.reduce((s, r) => s + r.estimated_cost, 0);

    const platformCosts = platformResult.rows.map(r => ({
      platform: r.platform,
      calls:    parseInt(r.calls),
      cost:     Math.round(parseInt(r.calls) * (COST_PER_CALL[r.platform] || 0.0001) * 10000) / 10000,
    }));

    res.json({
      projects,
      runs,
      platformCosts,
      totalCost:    Math.round(totalCost * 10000) / 10000,
      totalRuns:    runs.length,
      totalQueries: runs.reduce((s, r) => s + (parseInt(r.total_queries) || 0), 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────
// All users with stats
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.email, u.name, u.plan, u.created_at,
        COUNT(DISTINCT p.id) as projects,
        COUNT(DISTINCT cr.id) as runs,
        COALESCE(SUM(cr.total_queries), 0) as total_queries,
        MAX(cr.created_at) as last_run_at
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id
      LEFT JOIN check_runs cr ON cr.project_id = p.id
      GROUP BY u.id, u.email, u.name, u.plan, u.created_at
      ORDER BY u.created_at DESC
    `);

    const enriched = rows.map(u => ({
      ...u,
      estimated_cost: Math.round(
        parseInt(u.runs) * calcRunCost(
          parseInt(u.total_queries) / Math.max(parseInt(u.runs), 1), 5
        ) * 100
      ) / 100,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/admin/users/:id/plan ─────────────────────────────
// Update user plan
router.patch('/users/:id/plan', requireAuth, requireAdmin, async (req, res) => {
  const { plan } = req.body;
  const validPlans = ['free', 'pro', 'agency', 'enterprise'];
  if (!validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  try {
    const { rows } = await query(
      `UPDATE users SET plan=$1 WHERE id=$2 RETURNING id,email,name,plan`,
      [plan, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/api-health ───────────────────────────────────
// Check which API keys are configured
router.get('/api-health', requireAuth, requireAdmin, async (req, res) => {
  res.json({
    anthropic:   { configured: !!process.env.ANTHROPIC_API_KEY,  key_hint: process.env.ANTHROPIC_API_KEY?.slice(-6)  || null },
    openai:      { configured: !!process.env.OPENAI_API_KEY,     key_hint: process.env.OPENAI_API_KEY?.slice(-6)     || null },
    google:      { configured: !!process.env.GOOGLE_AI_API_KEY,  key_hint: process.env.GOOGLE_AI_API_KEY?.slice(-6)  || null },
    perplexity:  { configured: !!process.env.PERPLEXITY_API_KEY, key_hint: process.env.PERPLEXITY_API_KEY?.slice(-6) || null },
    serpapi:     { configured: !!process.env.SERPAPI_KEY,        key_hint: process.env.SERPAPI_KEY?.slice(-6)        || null },
  });
});

export default router;
