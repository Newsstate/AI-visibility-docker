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

// ─── Rank scoring ───────────────────────────────────────────────
export function scoreResponse(responseText, brandName, domain) {
  if (!responseText) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  const text = responseText.toLowerCase();
  const brand = brandName.toLowerCase();
  const dom = domain.toLowerCase();
  const mentioned = text.includes(brand) || text.includes(dom);

  if (!mentioned) return { tier: 'absent', score: 0, mentioned: false, sentiment: 'neutral', snippet: '' };

  // Find position
  const lines = responseText.split('\n');
  const brandLineIdx = lines.findIndex(l =>
    l.toLowerCase().includes(brand) || l.toLowerCase().includes(dom)
  );
  const totalLines = lines.length;
  const positionRatio = brandLineIdx >= 0 ? brandLineIdx / totalLines : 0.8;

  // Detect tier
  let tier, score;
  const firstSentence = responseText.split(/[.!?]/)[0].toLowerCase();
  const isFirst = firstSentence.includes(brand) || firstSentence.includes(dom);
  const numberMatch = responseText.match(new RegExp(`(?:^|\\n)\\s*1[.)].*${brand}`, 'i'));

  if (isFirst || numberMatch) { tier = 'primary'; score = 100; }
  else if (positionRatio < 0.25) { tier = 'top'; score = 80; }
  else if (positionRatio < 0.6) { tier = 'mentioned'; score = 50; }
  else { tier = 'buried'; score = 20; }

  // Sentiment
  const positiveWords = ['best', 'excellent', 'top', 'great', 'highly recommend', 'popular', 'leading'];
  const negativeWords = ['avoid', 'poor', 'bad', 'worst', 'not recommended', 'expensive'];
  const sentimentText = responseText.toLowerCase();
  const posScore = positiveWords.filter(w => sentimentText.includes(w)).length;
  const negScore = negativeWords.filter(w => sentimentText.includes(w)).length;
  const sentiment = posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'neutral';

  // Extract snippet
  const idx = responseText.toLowerCase().indexOf(brand);
  const snippet = idx >= 0
    ? responseText.slice(Math.max(0, idx - 60), idx + 120).trim()
    : '';

  return { tier, score, mentioned: true, sentiment, snippet };
}

// ─── ChatGPT ────────────────────────────────────────────────────
export async function checkChatGPT(promptText) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 800,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('ChatGPT error:', err.message);
    return null;
  }
}

// ─── Perplexity ─────────────────────────────────────────────────
export async function checkPerplexity(promptText) {
  try {
    const res = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar',
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 800
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    return res.data.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('Perplexity error:', err.message);
    return null;
  }
}

// ─── Gemini ─────────────────────────────────────────────────────
export async function checkGemini(promptText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(promptText);
    return result.response.text() || '';
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

// ─── Claude ─────────────────────────────────────────────────────
export async function checkClaude(promptText) {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: promptText }]
    });
    return res.content[0]?.text || '';
  } catch (err) {
    console.error('Claude check error:', err.message);
    return null;
  }
}

// ─── AI Overview (SERP) ─────────────────────────────────────────
export async function checkAIOverview(promptText) {
  try {
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
    const aiOverview = res.data?.ai_overview?.text_blocks
      ?.map(b => b.snippet || b.body || '')
      .join(' ') || '';
    return aiOverview || null;
  } catch (err) {
    console.error('SERP AI Overview error:', err.message);
    return null;
  }
}

// ─── Platform dispatcher ────────────────────────────────────────
export async function checkPlatform(platform, promptText) {
  switch (platform) {
    case 'chatgpt': return checkChatGPT(promptText);
    case 'perplexity': return checkPerplexity(promptText);
    case 'gemini': return checkGemini(promptText);
    case 'claude': return checkClaude(promptText);
    case 'ai_overview': return checkAIOverview(promptText);
    default: return null;
  }
}

export const PLATFORMS = ['chatgpt', 'perplexity', 'gemini', 'claude', 'ai_overview'];
export const RUNS_PER_PROMPT = 5;
