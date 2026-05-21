// src/services/analyzer.js
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Industry keyword detector ────────────────────────────────────
const INDUSTRY_MAP = [
  { match: /distill|alcohol|brew|spirit|liquor|whisky|vodka|beer|winery/i, label: 'Alcohol distillery and breweries' },
  { match: /pharma|medicine|drug|healthcare|hospital|clinic/i, label: 'Pharmaceutical and healthcare' },
  { match: /software|saas|tech|app|digital|platform|cloud/i, label: 'Technology and software' },
  { match: /real estate|property|builder|construct|realty/i, label: 'Real estate and construction' },
  { match: /finance|bank|loan|invest|insurance|fintech/i, label: 'Financial services' },
  { match: /food|restaurant|catering|cuisine|bakery/i, label: 'Food and beverage' },
  { match: /education|school|college|learn|course|training/i, label: 'Education and training' },
  { match: /manufactur|factory|industrial|production|plant/i, label: 'Manufacturing and production' },
  { match: /ecommerce|online store|retail|shop|marketplace/i, label: 'Ecommerce and retail' },
  { match: /travel|tourism|hotel|hospitality|resort/i, label: 'Travel and hospitality' },
  { match: /marketing|seo|ppc|advertising|branding|agency/i, label: 'Digital marketing agency' },
  { match: /legal|law firm|attorney|advocate|lawyer/i, label: 'Legal services' },
  { match: /logistics|supply chain|shipping|freight|transport/i, label: 'Logistics and supply chain' },
];

// ─── Service keyword extractor from body text ────────────────────
const SERVICE_PATTERNS = [
  { match: /contract manufactur/i, label: 'Contract Manufacturing' },
  { match: /bottling/i, label: 'Bottling Facilities' },
  { match: /license brand/i, label: 'License Brands' },
  { match: /distill/i, label: 'Distillery Operations' },
  { match: /seo/i, label: 'SEO Services' },
  { match: /ppc|pay.per.click/i, label: 'PPC Advertising' },
  { match: /social media/i, label: 'Social Media Marketing' },
  { match: /web develop/i, label: 'Web Development' },
  { match: /content market/i, label: 'Content Marketing' },
  { match: /branding/i, label: 'Branding' },
  { match: /ecommerce|e-commerce/i, label: 'Ecommerce' },
  { match: /cloud/i, label: 'Cloud Services' },
  { match: /consult/i, label: 'Consulting' },
  { match: /training|coaching/i, label: 'Training & Coaching' },
  { match: /export/i, label: 'Export' },
  { match: /logistics|shipping/i, label: 'Logistics' },
  { match: /legal|compliance/i, label: 'Legal Services' },
  { match: /finance|accounting/i, label: 'Financial Services' },
];

// ─── Competitor map by industry ──────────────────────────────────
const COMPETITOR_MAP = {
  'Alcohol distillery and breweries': ['United Spirits', 'Radico Khaitan', 'Pernod Ricard India', 'Allied Blenders'],
  'Digital marketing agency': ['WebFX', 'PageTraffic', 'Ignite Digital', 'SEOValley'],
  'Technology and software': ['Infosys', 'Wipro', 'TCS', 'HCL Technologies'],
  'Financial services': ['HDFC', 'ICICI', 'Bajaj Finance', 'Axis Bank'],
  'Ecommerce and retail': ['Amazon', 'Flipkart', 'Meesho', 'Myntra'],
  'Travel and hospitality': ['MakeMyTrip', 'Cleartrip', 'OYO', 'Yatra'],
  'Education and training': ['Byju\'s', 'Unacademy', 'Coursera', 'Udemy'],
};

// ─── Fallback: smart rule-based website analyzer ─────────────────
function extractBasicInfo(pages) {
  const home = pages[0];
  const title = home?.meta?.title || '';
  const description = home?.meta?.description || '';
  const h1s = home?.meta?.h1s || [];
  const h2s = pages.flatMap(p => p.meta?.h2s || []);
  const bodyText = pages.map(p => p.text).join(' ');

  // Smart brand — last segment after | or - (most sites put brand last)
  const titleParts = title.split(/[|\-–]/);
  const brand_name = titleParts.length > 1
    ? titleParts[titleParts.length - 1].trim()
    : titleParts[0].trim() || 'Brand';

  // Smart niche — H1 → description → industry detection from body
  let niche = h1s[0] || description.split('.')[0] || '';
  if (!niche || niche.length > 80) {
    for (const industry of INDUSTRY_MAP) {
      if (industry.match.test(bodyText) || industry.match.test(title)) {
        niche = industry.label;
        break;
      }
    }
  }
  if (!niche) niche = titleParts[0].trim();

  // Smart services — from H2s first, then body text patterns
  const NOISE_WORDS = ['our', 'we ', 'client', 'proven', 'track', 'record',
    'well', 'regarded', 'leading', 'top', 'best', 'about', 'contact',
    'team', 'portfolio', 'blog', 'news', 'faq', 'why choose',
    'passion', 'begins', 'story', 'growing', 'capacity', 'answer',
    'quality', 'taste', 'waste', 'commitment'];

  let services = h2s
    .filter(h => h.length < 45)
    .filter(h => !NOISE_WORDS.some(n => h.toLowerCase().includes(n)));

  // If H2-based services are poor, extract from body text
  if (services.length < 2) {
    services = SERVICE_PATTERNS
      .filter(s => s.match.test(bodyText))
      .map(s => s.label);
  }
  services = services.slice(0, 6);

  // Smart geo — from description or body
  const geoMatch = (description + ' ' + bodyText).match(
    /\bin ([\w\s]+?)(?:\s+offering|\s+providing|\s+based|\s+located|\.|,)/i
  );
  const geo_signals = geoMatch ? [geoMatch[1].trim()] : ['India'];

  // Smart competitors — from industry map
  const competitors = COMPETITOR_MAP[niche] || [];

  return { brand_name, niche, target_audience: 'Businesses and individuals', services, competitors, geo_signals, usp: description || title };
}

// ─── Fallback: smart template-based prompt generator ─────────────
function generateTemplatePrompts(analysis) {
  const { brand_name = 'Brand', niche = 'service', services = [], competitors = [] } = analysis;
  const s1 = services[0] || niche;
  const s2 = services[1] || niche;
  const nicheL = niche.toLowerCase();
  const s1L = s1.toLowerCase();
  const s2L = s2.toLowerCase();
  const comp = competitors[0] || 'top alternatives';

  return [
    // Category 1 — Niche discovery (no brand)
    { text: `best ${nicheL} in India`, category: 1 },
    { text: `top ${s1L} companies`, category: 1 },
    { text: `${nicheL} recommendations`, category: 1 },
    { text: `leading ${s2L} providers`, category: 1 },

    // Category 2 — Brand informational
    { text: `${brand_name} review and products`, category: 2 },
    { text: `how does ${brand_name} work`, category: 2 },
    { text: `is ${brand_name} a good company`, category: 2 },
    { text: `${brand_name} vs ${comp}`, category: 2 },

    // Category 3 — General niche keywords
    { text: `how to choose the best ${nicheL}`, category: 3 },
    { text: `${s1L} best practices for businesses`, category: 3 },
    { text: `what to look for in a ${s1L} provider`, category: 3 },
    { text: `${nicheL} industry trends`, category: 3 },

    // Category 4 — Informational hybrid
    { text: `which ${nicheL} is best for small business`, category: 4 },
    { text: `best ${s1L} for growing companies`, category: 4 },
    { text: `how to improve results with ${s2L}`, category: 4 },
    { text: `${nicheL} comparison guide`, category: 4 },
  ];
}

// ─── Fallback: rule-based recommendations ────────────────────────
function generateRuleBasedRecommendations(promptScores, analysis) {
  const recs = [];
  const brandName = analysis?.brand_name || 'Your brand';
  const niche = analysis?.niche || 'your industry';
  const total = promptScores.length || 1;
  const avgScore = promptScores.reduce((s, r) => s + (r.avg_rank_score || 0), 0) / total;
  const absentCount = promptScores.filter(r => r.best_rank_tier === 'absent').length;
  const primaryCount = promptScores.filter(r => r.best_rank_tier === 'primary').length;
  const buriedCount = promptScores.filter(r => r.best_rank_tier === 'buried').length;

  if (absentCount > total * 0.6) {
    recs.push({ type: 'warn', title: 'Brand missing from most AI responses', description: `${brandName} is absent from ${absentCount} out of ${total} tracked prompts. AI models recommend brands they have seen in authoritative, frequently cited content. Start by creating detailed FAQ pages and comparison articles in your niche.`, priority: 10 });
  }
  if (avgScore < 25) {
    recs.push({ type: 'warn', title: 'Low overall GEO score', description: `Your average visibility score is below 25. Focus on getting mentioned in third-party articles, directories, and review sites. AI models heavily rely on external sources when forming recommendations.`, priority: 9 });
  }
  if (primaryCount > 0) {
    recs.push({ type: 'good', title: `Strong in ${primaryCount} prompt${primaryCount > 1 ? 's' : ''}`, description: `${brandName} appears as the primary recommendation in ${primaryCount} tracked prompt${primaryCount > 1 ? 's' : ''}. Double down on content around these topics to defend and expand this visibility.`, priority: 7 });
  }
  if (buriedCount > 0) {
    recs.push({ type: 'info', title: 'Mentioned but not featured prominently', description: `Your brand appears in ${buriedCount} responses but is buried below competitors. Strengthen authority signals — get more backlinks, reviews, and structured data markup on your site.`, priority: 6 });
  }
  recs.push({ type: 'info', title: 'Add structured data (Schema.org)', description: `Add JSON-LD schema markup — specifically Organization, FAQPage, and Service schemas. AI models use structured data to confidently identify and recommend your brand in relevant queries.`, priority: 5 });
  recs.push({ type: 'info', title: 'Create comparison and "best of" content', description: `Write blog posts comparing ${brandName} with competitors. Titles like "${brandName} vs [Competitor]" and "Best ${niche} in 2025" perform very well in AI-generated recommendations.`, priority: 4 });

  return recs;
}

// ─── Main: analyzeWebsite ────────────────────────────────────────
export async function analyzeWebsite(pages) {
  const combined = pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.meta.title}\nDescription: ${p.meta.description}\nH1s: ${p.meta.h1s.join(', ')}\nContent: ${p.text.slice(0, 2000)}`
  ).join('\n\n---\n\n');

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: `Analyze this website content and extract structured information. Respond ONLY with valid JSON, no markdown, no explanation.\n\nWebsite content:\n${combined}\n\nReturn this exact JSON structure:\n{\n  "brand_name": "string",\n  "niche": "string (short, e.g. 'Digital marketing agency in India')",\n  "target_audience": "string",\n  "services": ["array", "of", "core", "services", "max 6"],\n  "competitors": ["array", "of", "likely", "competitor", "brand", "names", "max 5"],\n  "geo_signals": ["array", "of", "location", "signals", "e.g. India, global"],\n  "usp": "unique selling proposition in one sentence"\n}` }]
    });

    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    console.log('✅ Claude analyzed website successfully');
    return parsed;

  } catch (err) {
    console.warn('⚠️ Claude analyzer failed, using rule-based fallback:', err.message);
    return extractBasicInfo(pages);
  }
}

// ─── Main: generatePrompts ───────────────────────────────────────
export async function generatePrompts(analysis) {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `Generate exactly 16 AI visibility tracking prompts for this website in 4 categories of 4 prompts each. Respond ONLY with valid JSON.\n\nBrand: ${analysis.brand_name}\nNiche: ${analysis.niche}\nServices: ${analysis.services?.join(', ')}\nTarget audience: ${analysis.target_audience}\nCompetitors: ${analysis.competitors?.join(', ')}\nUSP: ${analysis.usp}\n\nCategories:\n1. Niche & core services discovery (no brand name, industry-level)\n2. Brand + service informational (includes brand name)\n3. General niche keywords (broader category, no brand)\n4. Informational + niche + service hybrid (specific use-case questions)\n\nReturn this exact JSON:\n{\n  "prompts": [\n    {"text": "prompt text", "category": 1},\n    ... exactly 16 prompts total, 4 per category\n  ]\n}` }]
    });

    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const prompts = parsed.prompts || [];
    if (prompts.length === 0) throw new Error('Empty prompts returned');
    console.log(`✅ Claude generated ${prompts.length} prompts`);
    return prompts;

  } catch (err) {
    console.warn('⚠️ Claude prompt generation failed, using template fallback:', err.message);
    const fallback = generateTemplatePrompts(analysis);
    console.log(`✅ Template fallback generated ${fallback.length} prompts`);
    return fallback;
  }
}

// ─── Main: generateRecommendations ──────────────────────────────
export async function generateRecommendations(promptScores, analysis) {
  const summary = JSON.stringify(promptScores.slice(0, 20));

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: `Based on these AI visibility check results, generate 4-6 actionable GEO recommendations. Respond ONLY with valid JSON.\n\nBrand: ${analysis.brand_name}\nNiche: ${analysis.niche}\nResults: ${summary}\n\nReturn this JSON:\n{\n  "recommendations": [\n    {\n      "type": "warn|info|good",\n      "title": "short action title",\n      "description": "2-3 sentence explanation with specific action",\n      "priority": 1-10\n    }\n  ]\n}` }]
    });

    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const recs = parsed.recommendations || [];
    if (recs.length === 0) throw new Error('Empty recommendations');
    console.log(`✅ Claude generated ${recs.length} recommendations`);
    return recs;

  } catch (err) {
    console.warn('⚠️ Claude recommendations failed, using rule-based fallback:', err.message);
    return generateRuleBasedRecommendations(promptScores, analysis);
  }
}
