// src/services/platformChecker.js
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI     = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// ─── Per-platform delays (ms) ────────────────────────────────────
const PLATFORM_DELAYS = {
  chatgpt:     300,
  perplexity:  200,
  gemini:      300,
  claude:      800,
  ai_overview: 1000,  // increased — SerpAPI is slow
};

// ─── Retry helper ────────────────────────────────────────────────
async function withRetry(fn, platform, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err.status === 429 ||
        err.response?.status === 429 ||
        err.message?.includes('rate_limit') ||
        err.message?.includes('429');

      if (isRateLimit && attempt < maxRetries) {
        const wait = attempt * 3000;
        console.warn(`⏳ ${platform} rate limited — retrying in ${wait/1000}s (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

// ─── Rank scoring ────────────────────────────────────────────────
export function scoreResponse(responseText, brandName, domain) {
  if (!responseText) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  const text  = responseText.toLowerCase();
  const brand = (brandName || '').toLowerCase();
  const dom   = (domain || '').toLowerCase().replace('www.', '');

  if (!brand && !dom) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  const mentioned = (brand && text.includes(brand)) || (dom && text.includes(dom));
  if (!mentioned) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  const lines        = responseText.split('\n');
  const brandLineIdx = lines.findIndex(l =>
    (brand && l.toLowerCase().includes(brand)) ||
    (dom   && l.toLowerCase().includes(dom))
  );
  const totalLines   = Math.max(lines.length, 1);
  const positionRatio = brandLineIdx >= 0 ? brandLineIdx / totalLines : 0.8;

  let tier, score;
  const firstSentence = responseText.split(/[.!?]/)[0].toLowerCase();
  const isFirst       = (brand && firstSentence.includes(brand)) || (dom && firstSentence.includes(dom));
  const numberMatch   = brand
    ? responseText.match(new RegExp(`(?:^|\\n)\\s*1[.)].*${brand}`, 'i'))
    : null;

  if (isFirst || numberMatch)    { tier = 'primary';   score = 100; }
  else if (positionRatio < 0.25) { tier = 'top';       score = 80;  }
  else if (positionRatio < 0.6)  { tier = 'mentioned'; score = 50;  }
  else                           { tier = 'buried';    score = 20;  }

  const positiveWords = ['best', 'excellent', 'top', 'great', 'highly recommend', 'popular', 'leading', 'trusted', 'award'];
  const negativeWords = ['avoid', 'poor', 'bad', 'worst', 'not recommended', 'expensive', 'scam', 'fraud'];
  const posScore  = positiveWords.filter(w => text.includes(w)).length;
  const negScore  = negativeWords.filter(w => text.includes(w)).length;
  const sentiment = posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'neutral';

  const searchTerm = brand || dom;
  const idx        = text.indexOf(searchTerm);
  const snippet    = idx >= 0
    ? responseText.slice(Math.max(0, idx - 60), idx + 120).trim()
    : '';

  return { tier, score, mentioned: true, sentiment, snippet };
}

// ─── ChatGPT ─────────────────────────────────────────────────────
export async function checkChatGPT(promptText) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY not set — ChatGPT check skipped');
    return null;
  }
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.chatgpt));
  try {
    return await withRetry(async () => {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: promptText }],
        max_tokens: 500,
        temperature: 0.7
      });
      return res.choices[0]?.message?.content || '';
    }, 'chatgpt');
  } catch (err) {
    console.error('ChatGPT error:', err.message);
    return null;
  }
}

// ─── Perplexity ──────────────────────────────────────────────────
export async function checkPerplexity(promptText) {
  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn('⚠️ PERPLEXITY_API_KEY not set — Perplexity check skipped');
    return null;
  }
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.perplexity));
  try {
    return await withRetry(async () => {
      const res = await axios.post('https://api.perplexity.ai/chat/completions', {
        model: 'sonar',
        messages: [{ role: 'user', content: promptText }],
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      return res.data.choices[0]?.message?.content || '';
    }, 'perplexity');
  } catch (err) {
    console.error('Perplexity error:', err.message);
    return null;
  }
}

// ─── Gemini ──────────────────────────────────────────────────────
export async function checkGemini(promptText) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn('⚠️ GOOGLE_AI_API_KEY not set — Gemini check skipped');
    return null;
  }
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.gemini));
  try {
    return await withRetry(async () => {
      const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(promptText);
      return result.response.text() || '';
    }, 'gemini');
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

// ─── Claude ──────────────────────────────────────────────────────
export async function checkClaude(promptText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — Claude check skipped');
    return null;
  }
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.claude));
  try {
    return await withRetry(async () => {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: promptText }]
      });
      return res.content[0]?.text || '';
    }, 'claude');
  } catch (err) {
    console.error('Claude check error:', err.message);
    return null;
  }
}

// ─── AI Overview (SERP) ──────────────────────────────────────────
// Extracts Google's AI Overview box text for a given query.
// Falls back to organic result snippets if AI Overview is absent.
export async function checkAIOverview(promptText) {

  // Skip entirely if no key — avoids silent 401 failures
  if (!process.env.SERPAPI_KEY) {
    console.warn('⚠️ SERPAPI_KEY not set — AI Overview check skipped');
    return null;
  }

  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.ai_overview));

  try {
    return await withRetry(async () => {
      const res = await axios.get('https://serpapi.com/search', {
        params: {
          q:       promptText,
          api_key: process.env.SERPAPI_KEY,
          engine:  'google',
          gl:      process.env.SERP_COUNTRY || 'us',  // configurable country
          hl:      process.env.SERP_LANG    || 'en',  // configurable language
          num:     5,                                  // top 5 organic results
          device:  'desktop',
        },
        timeout: 35000  // SerpAPI can be slow — give it 35s
      });

      const d = res.data;

      // ── Strategy 1: Google AI Overview box ──────────────────
      // Try all known field paths — SerpAPI changes these occasionally
      const aiText =
        // Array of text_blocks (most common format)
        d?.ai_overview?.text_blocks
          ?.map(b => b.snippet || b.body || b.text || '')
          .filter(Boolean).join(' ') ||

        // Array of blocks (alternate format)
        d?.ai_overview?.blocks
          ?.map(b => b.snippet || b.body || b.text || '')
          .filter(Boolean).join(' ') ||

        // Single text field
        d?.ai_overview?.text ||

        // Referenced links with snippets
        d?.ai_overview?.references
          ?.map(r => r.snippet || '').filter(Boolean).join(' ') ||

        null;

      if (aiText && aiText.trim().length > 10) {
        console.log(`✅ AI Overview found for: "${promptText.slice(0, 50)}"`);
        return aiText.trim();
      }

      // ── Strategy 2: Featured snippet / answer box ───────────
      // Shows up when Google has a definitive answer
      const answerBox =
        d?.answer_box?.answer ||
        d?.answer_box?.snippet ||
        d?.answer_box?.result ||
        null;

      if (answerBox && answerBox.trim().length > 10) {
        console.log(`✅ Answer box found for: "${promptText.slice(0, 50)}"`);
        return answerBox.trim();
      }

      // ── Strategy 3: Top 3 organic results ───────────────────
      // If no AI Overview, use organic results as a proxy
      // This still tells us if the brand appears in top Google results
      const organic = d?.organic_results
        ?.slice(0, 3)
        .map(r => [r.title, r.snippet].filter(Boolean).join(' — '))
        .filter(Boolean)
        .join(' | ') || null;

      if (organic) {
        console.log(`ℹ️ No AI Overview — using organic results for: "${promptText.slice(0, 50)}"`);
        return organic;
      }

      console.log(`⚠️ No usable SERP data for: "${promptText.slice(0, 50)}"`);
      return null;

    }, 'ai_overview');

  } catch (err) {
    // Log detailed error for debugging
    const status = err.response?.status;
    const msg    = err.response?.data?.error || err.message;

    if (status === 401) {
      console.error('SERP AI Overview: Invalid API key — check SERPAPI_KEY');
    } else if (status === 429) {
      console.error('SERP AI Overview: Rate limit hit — upgrade SerpAPI plan');
    } else {
      console.error(`SERP AI Overview error (${status || 'network'}):`, msg);
    }
    return null;
  }
}

// ─── Platform dispatcher ─────────────────────────────────────────
export async function checkPlatform(platform, promptText) {
  switch (platform) {
    case 'chatgpt':     return checkChatGPT(promptText);
    case 'perplexity':  return checkPerplexity(promptText);
    case 'gemini':      return checkGemini(promptText);
    case 'claude':      return checkClaude(promptText);
    case 'ai_overview': return checkAIOverview(promptText);
    default:            return null;
  }
}

export const PLATFORMS      = ['chatgpt', 'perplexity', 'gemini', 'claude', 'ai_overview'];
export const RUNS_PER_PROMPT = 3;
