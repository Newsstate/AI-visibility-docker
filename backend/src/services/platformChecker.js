// src/services/platformChecker.js
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// ─── Per-platform delays (ms) to avoid rate limits ──────────────
const PLATFORM_DELAYS = {
  chatgpt:     300,
  perplexity:  200,
  gemini:      300,
  claude:      800,   // Claude needs more gap — strictest rate limit
  ai_overview: 500,
};

// ─── Retry helper ────────────────────────────────────────────────
async function withRetry(fn, platform, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 429 ||
        err.message?.includes('rate_limit') ||
        err.message?.includes('429');

      if (isRateLimit && attempt < maxRetries) {
        const wait = attempt * 3000; // 3s then 6s
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

  const text = responseText.toLowerCase();
  const brand = brandName.toLowerCase();
  const dom = domain.toLowerCase().replace('www.', '');
  const mentioned = text.includes(brand) || text.includes(dom);

  if (!mentioned) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  const lines = responseText.split('\n');
  const brandLineIdx = lines.findIndex(l =>
    l.toLowerCase().includes(brand) || l.toLowerCase().includes(dom)
  );
  const totalLines = lines.length;
  const positionRatio = brandLineIdx >= 0 ? brandLineIdx / totalLines : 0.8;

  let tier, score;
  const firstSentence = responseText.split(/[.!?]/)[0].toLowerCase();
  const isFirst = firstSentence.includes(brand) || firstSentence.includes(dom);
  const numberMatch = responseText.match(new RegExp(`(?:^|\\n)\\s*1[.)].*${brand}`, 'i'));

  if (isFirst || numberMatch)    { tier = 'primary';   score = 100; }
  else if (positionRatio < 0.25) { tier = 'top';       score = 80;  }
  else if (positionRatio < 0.6)  { tier = 'mentioned'; score = 50;  }
  else                           { tier = 'buried';    score = 20;  }

  const positiveWords = ['best', 'excellent', 'top', 'great', 'highly recommend', 'popular', 'leading'];
  const negativeWords = ['avoid', 'poor', 'bad', 'worst', 'not recommended', 'expensive'];
  const posScore = positiveWords.filter(w => text.includes(w)).length;
  const negScore = negativeWords.filter(w => text.includes(w)).length;
  const sentiment = posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'neutral';

  const idx = text.indexOf(brand);
  const snippet = idx >= 0
    ? responseText.slice(Math.max(0, idx - 60), idx + 120).trim()
    : '';

  return { tier, score, mentioned: true, sentiment, snippet };
}

// ─── ChatGPT ─────────────────────────────────────────────────────
export async function checkChatGPT(promptText) {
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.chatgpt));
  try {
    return await withRetry(async () => {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',  // cheaper + faster than gpt-4o, same quality for checks
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
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.gemini));
  try {
    return await withRetry(async () => {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // flash = faster + cheaper than pro
      const result = await model.generateContent(promptText);
      return result.response.text() || '';
    }, 'gemini');
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

// ─── Claude ──────────────────────────────────────────────────────
// Uses Haiku — 10x cheaper, higher rate limits, fast
// Sonnet is reserved for analysis + recommendations (runs once, not 400 times)
export async function checkClaude(promptText) {
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.claude));
  try {
    return await withRetry(async () => {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // Haiku: higher rate limits, 10x cheaper
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
export async function checkAIOverview(promptText) {
  await new Promise(r => setTimeout(r, PLATFORM_DELAYS.ai_overview));
  try {
    return await withRetry(async () => {
      const res = await axios.get('https://serpapi.com/search', {
        params: {
          q: promptText,
          api_key: process.env.SERPAPI_KEY,
          engine: 'google',
          gl: 'us',
          hl: 'en'
        },
        timeout: 20000
      });
      return res.data?.ai_overview?.text_blocks
        ?.map(b => b.snippet || b.body || '')
        .join(' ') || null;
    }, 'ai_overview');
  } catch (err) {
    console.error('SERP AI Overview error:', err.message);
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

export const PLATFORMS = ['chatgpt', 'perplexity', 'gemini', 'claude', 'ai_overview'];
export const RUNS_PER_PROMPT = 3; // reduced from 5 → saves 40% API calls, still statistically valid
