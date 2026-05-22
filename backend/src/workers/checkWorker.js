// src/workers/checkWorker.js
import dotenv from 'dotenv';
dotenv.config();

import { Worker, Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { query } from '../db/pool.js';
import { checkPlatform, scoreResponse, PLATFORMS, RUNS_PER_PROMPT } from '../services/platformChecker.js';
import { generateRecommendations } from '../services/analyzer.js';

// ─── Fix: use REDIS_PUBLIC to avoid Railway overriding REDIS_URL ─
const REDIS_URL = process.env.REDIS_PUBLIC || process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const pubClient  = new Redis(REDIS_URL);

// Handle Redis connection errors gracefully
connection.on('error', err => console.error('Redis connection error:', err.message));
pubClient.on('error',  err => console.error('Redis pubClient error:', err.message));

// ─── Queue definitions ────────────────────────────────────────────
export const checkQueue       = new Queue('visibility-checks', { connection });
export const checkQueueEvents = new QueueEvents('visibility-checks', { connection });

// ─── GEO Score calculator ─────────────────────────────────────────
function calcGeoScore(platformScores) {
  const weights = { chatgpt:0.25, perplexity:0.25, gemini:0.20, claude:0.15, ai_overview:0.15 };
  let total = 0, weightSum = 0;
  for (const [platform, score] of Object.entries(platformScores)) {
    total     += (score || 0) * (weights[platform] || 0.2);
    weightSum += weights[platform] || 0.2;
  }
  if (weightSum === 0) return 0;
  return Math.round((total / weightSum) * 100) / 100;
}

// ─── Batch DB insert helper ───────────────────────────────────────
async function batchInsertResults(rows) {
  if (!rows.length) return;
  const values = rows.map((_, i) => {
    const b = i * 9;
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
  }).join(',');
  const params = rows.flatMap(r => [
    r.checkRunId, r.promptId, r.platform, r.tier, r.score,
    r.sentiment, r.snippet, r.mentioned, r.runIndex
  ]);
  await query(`
    INSERT INTO prompt_results
      (check_run_id, prompt_id, platform, rank_tier, rank_score, sentiment, response_snippet, mentioned, run_index)
    VALUES ${values}
  `, params);
}

// ─── Worker ──────────────────────────────────────────────────────
export const checkWorker = new Worker('visibility-checks', async (job) => {
  const { checkRunId, projectId, selectedPlatforms } = job.data;

  await query(`UPDATE check_runs SET status='running', started_at=NOW() WHERE id=$1`, [checkRunId]);

  const { rows: [project] } = await query(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  const { rows: prompts }   = await query(
    `SELECT * FROM prompts WHERE project_id=$1 AND is_active=true`, [projectId]
  );

  // Use selected platforms or fall back to all
  const activePlatforms = (selectedPlatforms?.length > 0)
    ? PLATFORMS.filter(p => selectedPlatforms.includes(p))
    : PLATFORMS;

  const totalQueries = prompts.length * activePlatforms.length * RUNS_PER_PROMPT;
  await query(`UPDATE check_runs SET total_queries=$1 WHERE id=$2`, [totalQueries, checkRunId]);

  let completedQueries = 0;
  const platformTotals = {};
  const resultBatch    = [];

  // ─── Process prompts in parallel batches of 4 ────────────────
  const BATCH_SIZE = 4;

  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);

    // All prompts in batch run simultaneously
    await Promise.all(batch.map(async (prompt) => {

      // All platforms run simultaneously per prompt
      await Promise.all(activePlatforms.map(async (platform) => {
        const runScores = [];

        // Runs are sequential per platform (avoids burst rate limits)
        for (let run = 1; run <= RUNS_PER_PROMPT; run++) {
          try {
            const response = await checkPlatform(platform, prompt.text);
            const scored   = scoreResponse(
              response || '',
              project.brand_name || project.domain,
              project.domain
            );

            // Collect for batch insert instead of individual writes
            resultBatch.push({
              checkRunId, promptId: prompt.id, platform,
              tier:      scored.tier,
              score:     scored.score,
              sentiment: scored.sentiment,
              snippet:   scored.snippet?.slice(0, 500) || null,
              mentioned: scored.mentioned,
              runIndex:  run
            });

            runScores.push(scored);
          } catch (err) {
            console.error(`Check failed: ${platform} / ${prompt.text.slice(0,40)}`, err.message);
          }

          completedQueries++;

          // Update DB every 10 queries instead of every 1
          if (completedQueries % 10 === 0 || completedQueries === totalQueries) {
            await query(
              `UPDATE check_runs SET completed_queries=$1 WHERE id=$2`,
              [completedQueries, checkRunId]
            );
          }

          // Publish live progress to SSE (every query for smooth UI)
          try {
            await pubClient.publish(`check:${checkRunId}`, JSON.stringify({
              type:       'progress',
              completed:  completedQueries,
              total:      totalQueries,
              platform,
              promptText: prompt.text.slice(0, 60),
              tier:       runScores[runScores.length - 1]?.tier || 'absent'
            }));
          } catch (pubErr) {
            // Don't crash if Redis pub fails — just log and continue
            console.warn('Redis publish failed:', pubErr.message);
          }
        } // run loop

        // Aggregate scores after all runs for this platform
        const mentions       = runScores.filter(r => r.mentioned).length;
        const avgScore       = runScores.length > 0
          ? runScores.reduce((s, r) => s + r.score, 0) / runScores.length : 0;
        const consistencyPct = runScores.length > 0
          ? (mentions / runScores.length) * 100 : 0;
        const bestTier       = [...runScores].sort((a,b) => b.score - a.score)[0]?.tier || 'absent';

        await query(`
          INSERT INTO prompt_scores
            (check_run_id, prompt_id, platform, avg_rank_score, consistency_pct, best_rank_tier)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (check_run_id, prompt_id, platform)
          DO UPDATE SET avg_rank_score=$4, consistency_pct=$5, best_rank_tier=$6
        `, [checkRunId, prompt.id, platform, avgScore, consistencyPct, bestTier]);

        if (!platformTotals[platform]) platformTotals[platform] = [];
        platformTotals[platform].push(avgScore);

      })); // platform parallel
    })); // prompt batch parallel

    // Batch insert all raw results collected in this batch
    if (resultBatch.length > 0) {
      try {
        await batchInsertResults([...resultBatch]);
        resultBatch.length = 0;
      } catch (err) {
        console.error('Batch insert failed, skipping:', err.message);
        resultBatch.length = 0;
      }
    }
  } // batch loop

  // ─── Final GEO scoring ────────────────────────────────────────
  const platformAverages = {};
  for (const [plat, scores] of Object.entries(platformTotals)) {
    platformAverages[plat] = scores.reduce((a,b) => a+b, 0) / scores.length;
  }
  const geoScore = calcGeoScore(platformAverages);

  // ─── AI Recommendations ───────────────────────────────────────
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
      niche:      project.niche,
      services:   project.services
    });
    for (const rec of recs) {
      await query(`
        INSERT INTO recommendations (check_run_id, type, title, description, priority)
        VALUES ($1,$2,$3,$4,$5)
      `, [checkRunId, rec.type, rec.title, rec.description, rec.priority]);
    }
  } catch {}

  // ─── Mark complete ────────────────────────────────────────────
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
