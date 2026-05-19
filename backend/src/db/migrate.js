// src/db/migrate.js
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','agency','enterprise')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (one website per project)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  brand_name TEXT,
  niche TEXT,
  target_audience TEXT,
  services JSONB DEFAULT '[]',
  competitors JSONB DEFAULT '[]',
  geo_signals JSONB DEFAULT '[]',
  check_frequency TEXT DEFAULT 'weekly' CHECK (check_frequency IN ('daily','weekly','biweekly','monthly')),
  tracking_snippet_id TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ
);

-- Prompts (auto-generated + manual)
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category INT CHECK (category BETWEEN 1 AND 4),
  source TEXT DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check runs (one run = all prompts × all platforms)
CREATE TABLE IF NOT EXISTS check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  total_queries INT DEFAULT 0,
  completed_queries INT DEFAULT 0,
  geo_score NUMERIC(5,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual prompt results per platform per run
CREATE TABLE IF NOT EXISTS prompt_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_run_id UUID REFERENCES check_runs(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('chatgpt','perplexity','gemini','claude','ai_overview')),
  rank_tier TEXT CHECK (rank_tier IN ('primary','top','mentioned','buried','absent')),
  rank_score INT DEFAULT 0,
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  response_snippet TEXT,
  mentioned BOOLEAN DEFAULT false,
  run_index INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregated scores per prompt (across 5 runs)
CREATE TABLE IF NOT EXISTS prompt_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_run_id UUID REFERENCES check_runs(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  avg_rank_score NUMERIC(5,2),
  consistency_pct NUMERIC(5,2),
  best_rank_tier TEXT,
  clicks INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(check_run_id, prompt_id, platform)
);

-- AI referral click tracking (from JS snippet)
CREATE TABLE IF NOT EXISTS click_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ai_source TEXT NOT NULL,
  landing_page TEXT,
  referrer TEXT,
  session_id TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitor visibility snapshots
CREATE TABLE IF NOT EXISTS competitor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_run_id UUID REFERENCES check_runs(id) ON DELETE CASCADE,
  competitor_domain TEXT NOT NULL,
  total_mentions INT DEFAULT 0,
  sav_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GEO recommendations
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_run_id UUID REFERENCES check_runs(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('warn','info','good')),
  title TEXT NOT NULL,
  description TEXT,
  priority INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_check_runs_project ON check_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_results_run ON prompt_results(check_run_id);
CREATE INDEX IF NOT EXISTS idx_click_events_project ON click_events(project_id);
CREATE INDEX IF NOT EXISTS idx_click_events_created ON click_events(created_at);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('✅ Database migrated successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);

export default pool;
