// src/routes/track.js
import { Router } from 'express';
import { query } from '../db/pool.js';
import crypto from 'crypto';

const router = Router();

// Receive click events from client tracking snippet
router.post('/', async (req, res) => {
  const { site_id, ai_source, landing_page, referrer, session_id } = req.body;
  if (!site_id || !ai_source) return res.status(400).json({ ok: false });

  try {
    const { rows: [project] } = await query(
      `SELECT id FROM projects WHERE tracking_snippet_id=$1`, [site_id]
    );
    if (!project) return res.status(404).json({ ok: false });

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const ip_hash = crypto.createHash('sha256').update(ip || '').digest('hex').slice(0, 16);

    await query(`
      INSERT INTO click_events (project_id, ai_source, landing_page, referrer, session_id, user_agent, ip_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [project.id, ai_source, landing_page, referrer, session_id, req.headers['user-agent']?.slice(0, 200), ip_hash]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ ok: false });
  }
});

// Serve the tracking snippet JS
router.get('/snippet/:siteId', async (req, res) => {
  const { siteId } = req.params;
  const apiBase = process.env.PUBLIC_API_URL || 'http://localhost:4000';

  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function(){
  var AI_SOURCES={'perplexity.ai':'Perplexity','chatgpt.com':'ChatGPT','chat.openai.com':'ChatGPT',
    'gemini.google.com':'Gemini','claude.ai':'Claude','copilot.microsoft.com':'Copilot'};
  var ref=document.referrer||'';
  var src=Object.keys(AI_SOURCES).find(function(d){return ref.indexOf(d)>=0;});
  if(!src)return;
  var sid=(Math.random()*1e9|0).toString(36);
  fetch('${apiBase}/api/track',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      site_id:'${siteId}',
      ai_source:AI_SOURCES[src],
      landing_page:window.location.pathname,
      referrer:ref,
      session_id:sid
    })
  }).catch(function(){});
})();
`);
});

export default router;
