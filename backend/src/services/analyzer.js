// src/services/analyzer.js
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FAST_MODEL = 'claude-haiku-4-5-20251001';

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

const COMPETITOR_MAP = {
  'Alcohol distillery and breweries': ['United Spirits', 'Radico Khaitan', 'Pernod Ricard India', 'Allied Blenders'],
  'Digital marketing agency': ['WebFX', 'PageTraffic', 'Ignite Digital', 'SEOValley'],
  'Technology and software': ['Infosys', 'Wipro', 'TCS', 'HCL Technologies'],
  'Financial services': ['HDFC', 'ICICI', 'Bajaj Finance', 'Axis Bank'],
  'Ecommerce and retail': ['Amazon', 'Flipkart', 'Meesho', 'Myntra'],
  'Travel and hospitality': ['MakeMyTrip', 'Cleartrip', 'OYO', 'Yatra'],
  'Education and training': ['Byju\'s', 'Unacademy', 'Coursera', 'Udemy'],
};

function extractBasicInfo(pages) {
  const home = pages[0];
  const title = home?.meta?.title || '';
  const description = home?.meta?.description || '';
  const h1s = home?.meta?.h1s || [];
  const h2s = pages.flatMap(p => p.meta?.h2s || []);
  const bodyText = pages.map(p => p.text).join(' ');

  const titleParts = title.split(/[|\-–]/);
  const brand_name = titleParts.length > 1
    ? titleParts[titleParts.length - 1].trim()
    : titleParts[0].trim() || 'Brand';

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

  const NOISE_WORDS = ['our', 'we ', 'client', 'proven', 'track', 'record',
    'well', 'regarded', 'leading', 'top', 'best', 'about', 'contact',
    'team', 'portfolio', 'blog', 'news', 'faq', 'why choose',
    'passion', 'begins', 'story', 'growing', 'capacity', 'answer',
    'quality', 'taste', 'waste', 'commitment'];

  let services = h2s
    .filter(h => h.length < 45)
    .filter(h => !NOISE_WORDS.some(n => h.toLowerCase().includes(n)));

  if (services.length < 2) {
    services = SERVICE_PATTERNS.filter(s => s.match.test(bodyText)).map(s => s.label);
  }
  services = services.slice(0, 6);

  const geoMatch = (description + ' ' + bodyText).match(
    /\bin ([\w\s]+?)(?:\s+offering|\s+providing|\s+based|\s+located|\.|,)/i
  );
  const geo_signals = geoMatch ? [geoMatch[1].trim()] : ['India'];
  const competitors = COMPETITOR_MAP[niche] || [];

  return { brand_name, niche, target_audience: 'Businesses and individuals', services, competitors, geo_signals, usp: description || title };
}

function generateTemplatePrompts(analysis) {
  const { brand_name = 'Brand', niche = 'service', services = [], competitors = [] } = analysis;
  const s1 = services[0] || niche;
  const s2 = services[1] || niche;
  const nicheL = niche.toLowerCase();
  const s1L = s1.toLowerCase();
  const s2L = s2.toLowerCase();
  const comp = competitors[0] || 'top alternatives';

  return [
    { text: `best ${nicheL} in India`, category: 1 },
    { text: `top ${s1L} companies`, category: 1 },
    { text: `${nicheL} recommendations`, category: 1 },
    { text: `leading ${s2L} providers`, category: 1 },
    { text: `${brand_name} review and products`, category: 2 },
    { text: `how does ${brand_name} work`, category: 2 },
    { text: `is ${brand_name} a good company`, category: 2 },
    { text: `${brand_name} vs ${comp}`, category: 2 },
    { text: `how to choose the best ${nicheL}`, category: 3 },
    { text: `${s1L} best practices for businesses`, category: 3 },
    { text: `what to look for in a ${s1L} provider`, category: 3 },
    { text: `${nicheL} industry trends`, category: 3 },
    { text: `which ${nicheL} is best for small business`, category: 4 },
    { text: `best ${s1L} for growing companies`, category: 4 },
    { text: `how to improve results with ${s2L}`, category: 4 },
    { text: `${nicheL} comparison guide`, category: 4 },
  ];
}

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

export async function analyzeWebsite(pages) {
  const combined = pages.slice(0, 3).map(p =>
    `URL: ${p.url}\nTitle: ${p.meta.title}\nDesc: ${p.meta.description}\nH1: ${p.meta.h1s.slice(0,2).join(', ')}\nH2: ${p.meta.h2s.slice(0,4).join(', ')}\nContent: ${p.text.slice(0, 800)}`
  ).join('\n---\n');

  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: `Analyze this website. Respond ONLY with valid JSON, no markdown.\n\n${combined}\n\nReturn:\n{"brand_name":"string","niche":"string","target_audience":"string","services":["max 6"],"competitors":["max 5"],"geo_signals":["locations"],"usp":"one sentence"}` }]
    });
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    console.log('✅ Claude (Haiku) analyzed website');
    return parsed;
  } catch (err) {
    console.warn('⚠️ Claude analyzer failed, using rule-based fallback:', err.message);
    return extractBasicInfo(pages);
  }
}

export async function generatePrompts(analysis) {
  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Generate 16 AI visibility prompts (4 per category). JSON only.\n\nBrand:${analysis.brand_name} Niche:${analysis.niche} Services:${analysis.services?.join(',')} Competitors:${analysis.competitors?.join(',')}\n\nCategories: 1=industry discovery (no brand) 2=brand+service 3=general niche 4=use-case hybrid\n\nReturn: {"prompts":[{"text":"...","category":1},... exactly 16]}` }]
    });
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const prompts = parsed.prompts || [];
    if (prompts.length === 0) throw new Error('Empty prompts');
    console.log(`✅ Claude (Haiku) generated ${prompts.length} prompts`);
    return prompts;
  } catch (err) {
    console.warn('⚠️ Claude prompt generation failed, using template fallback:', err.message);
    return generateTemplatePrompts(analysis);
  }
}

export async function analyzeAndGeneratePrompts(pages) {
  const combined = pages.slice(0, 3).map(p =>
    `URL: ${p.url}\nTitle: ${p.meta.title}\nDesc: ${p.meta.description}\nH1: ${p.meta.h1s.slice(0,2).join(', ')}\nH2: ${p.meta.h2s.slice(0,4).join(', ')}\nContent: ${p.text.slice(0, 800)}`
  ).join('\n---\n');

  const fallbackAnalysis = extractBasicInfo(pages);

  const [analysisResult, promptsFromFallback] = await Promise.allSettled([
    anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: `Analyze this website. JSON only, no markdown.\n\n${combined}\n\nReturn: {"brand_name":"string","niche":"string","target_audience":"string","services":["max 6"],"competitors":["max 5"],"geo_signals":["locations"],"usp":"one sentence"}` }]
    }),
    anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Generate 16 AI visibility prompts (4 per category). JSON only.\n\nBrand:${fallbackAnalysis.brand_name} Niche:${fallbackAnalysis.niche} Services:${fallbackAnalysis.services?.join(',')} Competitors:${fallbackAnalysis.competitors?.join(',')}\n\nCategories: 1=industry discovery (no brand) 2=brand+service 3=general niche 4=use-case hybrid\n\nReturn: {"prompts":[{"text":"...","category":1},... exactly 16]}` }]
    })
  ]);

  let analysis = fallbackAnalysis;
  if (analysisResult.status === 'fulfilled') {
    try {
      const text = analysisResult.value.content[0].text.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(text);
      console.log('✅ Claude (Haiku) analyzed website [parallel]');
    } catch {
      console.warn('⚠️ Analysis parse failed, using rule-based');
    }
  }

  let prompts = null;
  if (promptsFromFallback.status === 'fulfilled') {
    try {
      const text = promptsFromFallback.value.content[0].text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      if (parsed.prompts?.length > 0) {
        prompts = parsed.prompts;
        console.log(`✅ Claude (Haiku) generated ${prompts.length} prompts [parallel]`);
      }
    } catch {}
  }

  if (!prompts) {
    try {
      const res = await anthropic.messages.create({
        model: FAST_MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: `Generate 16 AI visibility prompts (4 per category). JSON only.\n\nBrand:${analysis.brand_name} Niche:${analysis.niche} Services:${analysis.services?.join(',')} Competitors:${analysis.competitors?.join(',')}\n\nCategories: 1=industry discovery (no brand) 2=brand+service 3=general niche 4=use-case hybrid\n\nReturn: {"prompts":[{"text":"...","category":1},... exactly 16]}` }]
      });
      const text = res.content[0].text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      prompts = parsed.prompts?.length > 0 ? parsed.prompts : generateTemplatePrompts(analysis);
    } catch {
      prompts = generateTemplatePrompts(analysis);
    }
  }

  return { analysis, prompts };
}

// ─── NEW: expandRankingPrompts ────────────────────────────────────
// Called after a scan completes. Takes prompts where the brand is
// ranking (tier != absent) and generates targeted variations of those
// exact winning prompts — so future scans focus on proven keywords.
export async function expandRankingPrompts(rankingPrompts, analysis) {
  if (!rankingPrompts || rankingPrompts.length === 0) {
    console.log('ℹ️ No ranking prompts to expand');
    return [];
  }

  // Build a compact summary: prompt text + best tier + which platforms
  const ranked = rankingPrompts.map(p => ({
    text: p.text,
    tier: p.best_tier,        // primary / top / mentioned / buried
    platforms: p.platforms    // e.g. ['chatgpt', 'gemini']
  }));

  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are an AI visibility keyword strategist.

This brand is already ranking on these prompts in AI platforms:
${JSON.stringify(ranked, null, 2)}

Brand: ${analysis.brand_name}
Niche: ${analysis.niche}
Services: ${analysis.services?.join(', ')}

Generate 8-12 NEW prompt variations that are closely related to the winning prompts above.
Goal: find more specific, long-tail versions of these winning keywords where the brand is likely to also rank.
Rules:
- Each new prompt must be a natural question or search query a user would actually type
- Build on the themes of the ranking prompts — don't invent new unrelated topics
- Mix question formats (what is, how to, best, compare, which, who offers)
- Do NOT repeat any of the input prompts
- Assign category: 1=discovery 2=brand 3=general 4=use-case

JSON only:
{"prompts":[{"text":"...","category":1,"based_on":"original prompt it expands"}]}`
      }]
    });

    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const prompts = parsed.prompts || [];
    console.log(`✅ Expanded ${rankingPrompts.length} ranking prompts → ${prompts.length} new targeted prompts`);
    return prompts;

  } catch (err) {
    console.warn('⚠️ expandRankingPrompts failed:', err.message);
    return [];
  }
}

export async function generateRecommendations(promptScores, analysis) {
  const summary = JSON.stringify(promptScores.slice(0, 10).map(s => ({
    prompt: s.prompt_text?.slice(0, 50),
    platform: s.platform,
    score: Math.round(s.avg_rank_score || 0),
    tier: s.best_rank_tier
  })));

  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Based on these AI visibility results, give 4-6 actionable GEO recommendations. JSON only.\n\nBrand:${analysis.brand_name} Niche:${analysis.niche}\nResults:${summary}\n\nReturn: {"recommendations":[{"type":"warn|info|good","title":"short title","description":"2-3 sentences","priority":1-10}]}` }]
    });
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const recs = parsed.recommendations || [];
    if (recs.length === 0) throw new Error('Empty recommendations');
    console.log(`✅ Claude (Haiku) generated ${recs.length} recommendations`);
    return recs;
  } catch (err) {
    console.warn('⚠️ Claude recommendations failed, using rule-based fallback:', err.message);
    return generateRuleBasedRecommendations(promptScores, analysis);
  }
}
