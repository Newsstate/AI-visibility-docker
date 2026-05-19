// src/services/analyzer.js
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeWebsite(pages) {
  const combined = pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.meta.title}\nDescription: ${p.meta.description}\nH1s: ${p.meta.h1s.join(', ')}\nContent: ${p.text.slice(0, 2000)}`
  ).join('\n\n---\n\n');

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Analyze this website content and extract structured information. Respond ONLY with valid JSON, no markdown, no explanation.

Website content:
${combined}

Return this exact JSON structure:
{
  "brand_name": "string",
  "niche": "string (short, e.g. 'Online yoga & fitness platform')",
  "target_audience": "string",
  "services": ["array", "of", "core", "services", "max 6"],
  "competitors": ["array", "of", "likely", "competitor", "brand", "names", "max 5"],
  "geo_signals": ["array", "of", "location", "signals", "e.g. India, global"],
  "usp": "unique selling proposition in one sentence"
}`
    }]
  });

  try {
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return {
      brand_name: pages[0]?.meta?.title?.split('|')[0]?.trim() || 'Unknown',
      niche: 'Website',
      target_audience: 'General audience',
      services: [],
      competitors: [],
      geo_signals: [],
      usp: ''
    };
  }
}

export async function generatePrompts(analysis) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Generate exactly 16 AI visibility tracking prompts for this website in 4 categories of 4 prompts each. Respond ONLY with valid JSON.

Brand: ${analysis.brand_name}
Niche: ${analysis.niche}
Services: ${analysis.services?.join(', ')}
Target audience: ${analysis.target_audience}
Competitors: ${analysis.competitors?.join(', ')}
USP: ${analysis.usp}

Categories:
1. Niche & core services discovery (no brand name, industry-level)
2. Brand + service informational (includes brand name)
3. General niche keywords (broader category, no brand)
4. Informational + niche + service hybrid (specific use-case questions)

Return this exact JSON:
{
  "prompts": [
    {"text": "prompt text", "category": 1},
    ... exactly 16 prompts total, 4 per category
  ]
}`
    }]
  });

  try {
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return parsed.prompts || [];
  } catch {
    return [];
  }
}

export async function generateRecommendations(promptScores, analysis) {
  const summary = JSON.stringify(promptScores.slice(0, 20));
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Based on these AI visibility check results, generate 4-6 actionable GEO (Generative Engine Optimization) recommendations. Respond ONLY with valid JSON.

Brand: ${analysis.brand_name}
Niche: ${analysis.niche}
Prompt results summary: ${summary}

Return this JSON:
{
  "recommendations": [
    {
      "type": "warn|info|good",
      "title": "short action title",
      "description": "2-3 sentence explanation with specific action and expected impact",
      "priority": 1-10
    }
  ]
}`
    }]
  });

  try {
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return parsed.recommendations || [];
  } catch {
    return [];
  }
}
