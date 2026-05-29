// src/workers/checkWorker.js
import dotenv from 'dotenv';
dotenv.config();

import { Worker, Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { query } from '../db/pool.js';
import { checkPlatform, scoreResponse, PLATFORMS, RUNS_PER_PROMPT } from '../services/platformChecker.js';
import { generateRecommendations, expandRankingPrompts } from '../services/analyzer.js';

const REDIS_URL = process.env.REDIS_PUBLIC || process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const pubClient  = new Redis(REDIS_URL);

connection.on('error', err => console.error('Redis connection error:', err.message));
pubClient.on('error',  err => console.error('Redis pubClient error:', err.message));

export const checkQueue       = new Queue('visibility-checks', { connection });
export const checkQueueEvents = new QueueEvents('visibility-checks', { connection });

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

export const checkWorker = new Worker('visibility-checks', async (job) => {
  const { checkRunId, projectId, selectedPlatforms } = job.data;

  await query(`UPDATE check_runs SET status='running', started_at=NOW() WHERE id=$1`, [checkRunId]);

  const { rows: [project] } = await query(`SELECT * FROM projects WHERE id=$1`, [projectId]);
  const { rows: prompts }   = await query(
    `SELECT * FROM prompts WHERE project_id=$1 AND is_active=true`, [projectId]
  );

  const activePlatforms = (selectedPlatforms?.length > 0)
    ? PLATFORMS.filter(p => selectedPlatforms.includes(p))
    : PLATFORMS;

  const totalQueries = prompts.length * activePlatforms.length * RUNS_PER_PROMPT;
  await query(`UPDATE check_runs SET total_queries=$1 WHERE id=$2`, [totalQueries, checkRunId]);

  let completedQueries = 0;
  const platformTotals = {};
  const resultBatch    = [];
  const BATCH_SIZE     = parseInt(process.env.PROMPT_BATCH_SIZE) || 6;

  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (prompt) => {
      await Promise.all(activePlatforms.map(async (platform) => {
        const runScores = [];

        const runResults = await Promise.allSettled(
          Array.from({ length: RUNS_PER_PROMPT }, (_, idx) =>
            checkPlatform(platform, prompt.text).then(response => ({ response, run: idx + 1 }))
          )
        );

        for (const result of runResults) {
          if (result.status === 'rejected') {
            console.error(`Check failed: ${platform} / ${prompt.text.slice(0,40)}`, result.reason?.message);
            completedQueries++;
            continue;
          }

          const { response, run } = result.value;
          const scored = scoreResponse(
            response || '',
            project.brand_name || project.domain,
            project.domain
          );

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
          completedQueries++;

          if (completedQueries % 10 === 0 || completedQueries === totalQueries) {
            await query(
              `UPDATE check_runs SET completed_queries=$1 WHERE id=$2`,
              [completedQueries, checkRunId]
            );
          }

          try {
            await pubClient.publish(`check:${checkRunId}`, JSON.stringify({
              type:       'progress',
              completed:  completedQueries,
              total:      totalQueries,
              platform,
              promptText: prompt.text.slice(0, 60),
              tier:       scored.tier || 'absent'
            }));
          } catch (pubErr) {
            console.warn('Redis publish failed:', pubErr.message);
          }
        }

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
      }));
    }));

    if (resultBatch.length > 0) {
      try {
        await batchInsertResults([...resultBatch]);
        resultBatch.length = 0;
      } catch (err) {
        console.error('Batch insert failed, skipping:', err.message);
        resultBatch.length = 0;
      }
    }
  }

  // ─── Final GEO scoring ────────────────────────────────────────
  const platformAverages = {};
  for (const [plat, scores] of Object.entries(platformTotals)) {
    platformAverages[plat] = scores.reduce((a,b) => a+b, 0) / scores.length;
  }
  const geoScore = calcGeoScore(platformAverages);

  // ─── Aggregate scores for post-scan analysis ──────────────────
  const { rows: scores } = await query(`
    SELECT ps.*, p.text as prompt_text, p.category
    FROM prompt_scores ps
    JOIN prompts p ON ps.prompt_id = p.id
    WHERE ps.check_run_id=$1
    ORDER BY ps.avg_rank_score DESC
  `, [checkRunId]);

  // ─── AI Recommendations ───────────────────────────────────────
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

  // ─── NEW: Expand ranking prompts after scan ───────────────────
  // Find prompts where brand is ranking (not absent) across any platform.
  // Group by prompt, pick the best tier seen across all platforms.
  try {
    const tierRank = { primary: 4, top: 3, mentioned: 2, buried: 1, absent: 0 };

    // Aggregate per prompt: best tier + which platforms it ranked on
    const promptMap = {};
    for (const row of scores) {
      if (row.best_rank_tier === 'absent') continue;
      if (!promptMap[row.prompt_id]) {
        promptMap[row.prompt_id] = {
          id:        row.prompt_id,
          text:      row.prompt_text,
          best_tier: row.best_rank_tier,
          platforms: []
        };
      }
      const entry = promptMap[row.prompt_id];
      entry.platforms.push(row.platform);
      // Keep the highest-tier seen
      if ((tierRank[row.best_rank_tier] || 0) > (tierRank[entry.best_tier] || 0)) {
        entry.best_tier = row.best_rank_tier;
      }
    }

    const rankingPrompts = Object.values(promptMap);
    console.log(`🎯 Found ${rankingPrompts.length} ranking prompts — expanding...`);

    if (rankingPrompts.length > 0) {
      const expanded = await expandRankingPrompts(rankingPrompts, {
        brand_name: project.brand_name,
        niche:      project.niche,
        services:   project.services
      });

      // Get existing prompt texts to avoid duplicates
      const { rows: existingPrompts } = await query(
        `SELECT text FROM prompts WHERE project_id=$1`, [projectId]
      );
      const existingTexts = new Set(existingPrompts.map(p => p.text.toLowerCase().trim()));

      // Insert new expanded prompts that don't already exist
      let added = 0;
      for (const p of expanded) {
        const normalised = p.text.toLowerCase().trim();
        if (!normalised || existingTexts.has(normalised)) continue;

        await query(
          `INSERT INTO prompts (project_id, text, category, source) VALUES ($1,$2,$3,'auto')`,
          [projectId, p.text.trim(), p.category || null]
        );
        existingTexts.add(normalised); // prevent dupes within the batch
        added++;
      }
      console.log(`✅ Added ${added} new targeted prompts from ranking expansion`);
    }
  } catch (err) {
    // Non-fatal — don't fail the whole run
    console.warn('⚠️ Ranking prompt expansion failed:', err.message);
  }

  // ─── Mark complete ────────────────────────────────────────────
  await query(`
    UPDATE check_runs SET status='completed', completed_at=NOW(), geo_score=$1 WHERE id=$2
  `, [geoScore, checkRunId]);

  await query(`UPDATE projects SET last_checked_at=NOW() WHERE id=$1`, [projectId]);

  return { geoScore, totalQueries, completedQueries };

}, { connection, concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 5 });

checkWorker.on('completed', (job, result) => {
  console.log(`✅ Check run ${job.data.checkRunId} done. GEO score: ${result.geoScore}`);
});

checkWorker.on('failed', async (job, err) => {
  console.error(`❌ Check run ${job?.data?.checkRunId} failed:`, err.message);
  if (job?.data?.checkRunId) {
    await query(`UPDATE check_runs SET status='failed' WHERE id=$1`, [job.data.checkRunId]);
  }
});
