// src/services/crawler.js
import axios from 'axios';
import * as cheerio from 'cheerio';

const TIMEOUT = parseInt(process.env.CRAWL_TIMEOUT_MS) || 15000;
const MAX_PAGES = parseInt(process.env.MAX_PAGES_PER_CRAWL) || 5;

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AIVisibilityBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    maxRedirects: 5
  });
  return res.data;
}

function extractText(html) {
  const $ = cheerio.load(html);
  $('script,style,nav,footer,header,noscript,iframe').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = new Set();
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      const abs = new URL(href, baseUrl);
      if (abs.hostname === base.hostname && abs.pathname !== base.pathname) {
        links.add(abs.href.split('#')[0]);
      }
    } catch {}
  });
  return [...links].slice(0, MAX_PAGES - 1);
}

function extractMeta(html) {
  const $ = cheerio.load(html);
  return {
    title: $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '',
    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
    keywords: $('meta[name="keywords"]').attr('content') || '',
    h1s: $('h1').map((_, el) => $(el).text().trim()).get().slice(0, 5),
    h2s: $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10),
  };
}

export async function crawlWebsite(url) {
  const pages = [];
  try {
    const homeHtml = await fetchPage(url);
    const homeMeta = extractMeta(homeHtml);
    const homeText = extractText(homeHtml);
    pages.push({ url, meta: homeMeta, text: homeText });

    const subLinks = extractLinks(homeHtml, url);
    const prioritized = subLinks.filter(l =>
      /about|service|product|feature|solution|pricing|blog/i.test(l)
    ).slice(0, MAX_PAGES - 1);

    await Promise.allSettled(prioritized.map(async (link) => {
      try {
        const html = await fetchPage(link);
        pages.push({ url: link, meta: extractMeta(html), text: extractText(html) });
      } catch {}
    }));
  } catch (err) {
    throw new Error(`Failed to crawl ${url}: ${err.message}`);
  }
  return pages;
}

export function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}
