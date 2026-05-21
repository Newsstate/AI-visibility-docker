// src/workers/checkWorker.js
import dotenv from 'dotenv';
dotenv.config();

import { Worker, Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { query } from '../db/pool.js';
import { checkPlatform, scoreResponse, PLATFORMS, RUNS_PER_PROMPT } from '../services/platformChecker.js';
import { generateRecommendations } from '../services/analyzer.js';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});
const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// ─── Queue definitions ───────────────────────────────────────────
export const checkQueue = new Queue('visibility-checks', { connection });
export const checkQueueEvents = new QueueEvents('visibility-checks', { connection });

// ─── GEO Score calculator ────────────────────────────────────────
function calcGeoScore(platformScores) {
  const weights = { chatgpt: 0.25, perplexity: 0.25, gemini: 0.20, claude: 0.15, ai_overview: 0.15 };
  let total = 0, weightSum = 0;
  for (const [platform, score] of Object.entries(platformScores)) {
    total += (score || 0) * (weights[platform] || 0.2);
    weightSum += weights[platform] || 0.2;
  }
  if (weightSum === 0) return 0; // ← ADD THIS
  return Math.round((total / weightSum) * 100) / 100;
}

// ─── Worker ──────────────────────────────────────────────────────
export const checkWorker = new Worker('visibility-checks', async (job) => {
const { checkRunId, projectId, selectedPlatforms } = job.data;

  await query(`UPDATE check_runs SET status='running', started_at=NOW() WHERE id=$1`, [checkRunId]);

  const { rows: [project] } = await query(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  const { rows: prompts } = await query(
    `SELECT * FROM prompts WHERE project_id=$1 AND is_active=true`, [projectId]
  );

 // Use selected platforms from job data, fall back to all platforms
const activePlatforms = (selectedPlatforms && selectedPlatforms.length > 0)
  ? PLATFORMS.filter(p => selectedPlatforms.includes(p))
  : PLATFORMS;

const totalQueries = prompts.length * activePlatforms.length * RUNS_PER_PROMPT;
  await query(`UPDATE check_runs SET total_queries=$1 WHERE id=$2`, [totalQueries, checkRunId]);

  let completedQueries = 0;
  const platformTotals = {};

  // ─── Prompt loop ─────────────────────────────────────────────
  for (const prompt of prompts) {
  for (const platform of activePlatforms) {
      const runScores = [];

      // ─── Run loop (5 runs per prompt/platform) ──────────────
      for (let run = 1; run <= RUNS_PER_PROMPT; run++) {
        try {
       

          const response = await checkPlatform(platform, prompt.text);
          const scored = scoreResponse(
            response || '',
            project.brand_name || project.domain,
            project.domain
          );

          await query(`
            INSERT INTO prompt_results
              (check_run_id, prompt_id, platform, rank_tier, rank_score, sentiment, response_snippet, mentioned, run_index)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `, [checkRunId, prompt.id, platform, scored.tier, scored.score,
              scored.sentiment, scored.snippet?.slice(0, 500), scored.mentioned, run]);

          runScores.push(scored);
        } catch (err) {
          console.error(`Check failed: ${platform} / ${prompt.text.slice(0, 40)}`, err.message);
        }

        completedQueries++;
        await query(`UPDATE check_runs SET completed_queries=$1 WHERE id=$2`, [completedQueries, checkRunId]);

        await pubClient.publish(`check:${checkRunId}`, JSON.stringify({
          type: 'progress',
          completed: completedQueries,
          total: totalQueries,
          platform,
          promptText: prompt.text.slice(0, 60),
          tier: runScores[runScores.length - 1]?.tier || 'absent'
        }));
      } // ← run loop ends here

      // ─── Aggregate after all 5 runs ─────────────────────────
      const mentions = runScores.filter(r => r.mentioned).length;
    const avgScore = runScores.length > 0
  ? runScores.reduce((s, r) => s + r.score, 0) / runScores.length
  : 0;
     const consistencyPct = runScores.length > 0
  ? (mentions / runScores.length) * 100
  : 0;
      const bestTier = runScores.sort((a, b) => b.score - a.score)[0]?.tier || 'absent';

      await query(`
        INSERT INTO prompt_scores
          (check_run_id, prompt_id, platform, avg_rank_score, consistency_pct, best_rank_tier)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (check_run_id, prompt_id, platform)
        DO UPDATE SET avg_rank_score=$4, consistency_pct=$5, best_rank_tier=$6
      `, [checkRunId, prompt.id, platform, avgScore, consistencyPct, bestTier]);

      if (!platformTotals[platform]) platformTotals[platform] = [];
      platformTotals[platform].push(avgScore);

    } // ← platform loop ends here
  } // ← prompt loop ends here

  // ─── Final scoring ───────────────────────────────────────────
  const platformAverages = {};
  for (const [plat, scores] of Object.entries(platformTotals)) {
    platformAverages[plat] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  const geoScore = calcGeoScore(platformAverages);

  // ─── AI Recommendations ──────────────────────────────────────
  const { rows: scores } = await query(`
    SELECT ps.*, p.text as prompt_text, p.category
    FROM prompt_scores ps
    JOIN prompts p ON ps.prompt_id = p.id
    WHERE ps.check_run_id=$1
    ORDER BY ps.avg_rank_score DESC
  `, [checkRunId]);

  try {
    const recs = await generateRecommendations(scores, {
      brand_name: project.brand_name,
      niche: project.niche,
      services: project.services
    });
    for (const rec of recs) {
      await query(`
        INSERT INTO recommendations (check_run_id, type, title, description, priority)
        VALUES ($1,$2,$3,$4,$5)
      `, [checkRunId, rec.type, rec.title, rec.description, rec.priority]);
    }
  } catch {}

  // ─── Mark complete ───────────────────────────────────────────
  await query(`
    UPDATE check_runs SET status='completed', completed_at=NOW(), geo_score=$1 WHERE id=$2
  `, [geoScore, checkRunId]);

  await query(`UPDATE projects SET last_checked_at=NOW() WHERE id=$1`, [projectId]);

  return { geoScore, totalQueries, completedQueries };

}, { connection, concurrency: 3 });

checkWorker.on('completed', (job, result) => {
  console.log(`✅ Check run ${job.data.checkRunId} done. GEO score: ${result.geoScore}`);
});

checkWorker.on('failed', async (job, err) => {
  console.error(`❌ Check run ${job?.data?.checkRunId} failed:`, err.message);
  if (job?.data?.checkRunId) {
    await query(`UPDATE check_runs SET status='failed' WHERE id=$1`, [job.data.checkRunId]);
  }
});
