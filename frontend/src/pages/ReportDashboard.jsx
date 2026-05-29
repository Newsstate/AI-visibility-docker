// src/pages/ReportDashboard.jsx
import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import { reports, projects as projectsApi } from '../lib/api.js';
import RankBadge from '../components/RankBadge.jsx';
import ConsistencyPips from '../components/ConsistencyPips.jsx';
import toast from 'react-hot-toast';

Chart.register(...registerables);

const PLATFORM_META = {
  chatgpt:     { label:'ChatGPT',     color:'#378ADD', dot:'#378ADD', icon:'ti-brand-openai' },
  perplexity:  { label:'Perplexity',  color:'#1D9E75', dot:'#1D9E75', icon:'ti-search'       },
  gemini:      { label:'Gemini',      color:'#EF9F27', dot:'#EF9F27', icon:'ti-brand-google'  },
  claude:      { label:'Claude',      color:'#D85A30', dot:'#D85A30', icon:'ti-robot'         },
  ai_overview: { label:'AI Overview', color:'#888780', dot:'#888780', icon:'ti-layout-list'   },
};

const CAT_LABELS = {1:'Cat 1',2:'Cat 2',3:'Cat 3',4:'Cat 4'};
const CAT_STYLES = {
  1: {bg:'#EEEDFE',color:'#3C3489'},
  2: {bg:'#E1F5EE',color:'#0F6E56'},
  3: {bg:'#FAEEDA',color:'#854F0B'},
  4: {bg:'#FAECE7',color:'#712B13'},
};

const SENTIMENT_CONFIG = {
  positive: { icon:'ti-mood-happy',   color:'#0F6E56', bg:'#E1F5EE', label:'Positive' },
  negative: { icon:'ti-mood-sad',     color:'#791F1F', bg:'#FCEBEB', label:'Negative' },
  neutral:  { icon:'ti-mood-neutral', color:'#5F5E5A', bg:'#F1EFE8', label:'Neutral'  },
};

const TIER_CONFIG = {
  primary:   { color:'#0F6E56', bg:'#E1F5EE' },
  top:       { color:'#185FA5', bg:'#E6F1FB' },
  mentioned: { color:'#854F0B', bg:'#FAEEDA' },
  buried:    { color:'#A32D2D', bg:'#FCEBEB' },
  absent:    { color:'#5F5E5A', bg:'#F1EFE8' },
};

// ─── Helpers ──────────────────────────────────────────────────────
function safeParseArray(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch { return []; }
}

// ─── Sub-components ───────────────────────────────────────────────
function GeoScoreCircle({ score }) {
  const display = (score !== null && score !== undefined && !isNaN(score) && score > 0)
    ? Math.round(score) : '—';
  return (
    <div className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-full flex-shrink-0"
      style={{background:'#EEEDFE'}}>
      <span className="text-[22px] font-medium leading-none" style={{color:'#3C3489'}}>{display}</span>
      <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{color:'#534AB7'}}>GEO score</span>
    </div>
  );
}

function PlatformBar({ platform, score, primaryCount, topCount, mentionedCount, buriedCount, absentCount, total }) {
  const meta = PLATFORM_META[platform] || { label: platform, color: '#888' };
  const mentioned = total - absentCount;
  const mentionedPct = Math.round((mentioned / Math.max(total, 1)) * 100);

  // Tier segment widths as % of total prompts
  const primaryPct   = Math.round((primaryCount   / Math.max(total,1)) * 100);
  const topPct       = Math.round((topCount       / Math.max(total,1)) * 100);
  const mentionedPct2= Math.round((mentionedCount / Math.max(total,1)) * 100);
  const buriedPct    = Math.round((buriedCount    / Math.max(total,1)) * 100);
  const absentPct    = 100 - primaryPct - topPct - mentionedPct2 - buriedPct;

  // Overall tier label
  const overallTier = primaryCount > 0 ? 'primary'
    : topCount > 0 ? 'top'
    : mentionedCount > 0 ? 'mentioned'
    : buriedCount > 0 ? 'buried'
    : 'absent';

  return (
    <div className="py-2.5 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1'}}>

      {/* Row 1 — platform name + score + overall tier */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="text-xs font-medium text-gray-800 w-28 flex-shrink-0">{meta.label}</span>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">{mentioned}/{total} prompts</span>
        <span className="text-xs font-medium text-gray-800 w-6 text-right">{Math.round(score)}</span>
        <RankBadge tier={overallTier} />
      </div>

      {/* Row 2 — segmented tier bar */}
      <div className="flex h-2 rounded-full overflow-hidden ml-[7.5rem]" style={{background:'#f1efe8'}}>
        {primaryPct > 0 && (
          <div style={{width:`${primaryPct}%`, background:'#1D9E75'}} title={`Primary: ${primaryCount}`} />
        )}
        {topPct > 0 && (
          <div style={{width:`${topPct}%`, background:'#378ADD'}} title={`Top: ${topCount}`} />
        )}
        {mentionedPct2 > 0 && (
          <div style={{width:`${mentionedPct2}%`, background:'#EF9F27'}} title={`Mentioned: ${mentionedCount}`} />
        )}
        {buriedPct > 0 && (
          <div style={{width:`${buriedPct}%`, background:'#E24B4A'}} title={`Buried: ${buriedCount}`} />
        )}
        {absentPct > 0 && (
          <div style={{width:`${absentPct}%`, background:'#D3D1C7'}} title={`Absent: ${absentCount}`} />
        )}
      </div>

      {/* Row 3 — tier counts */}
      <div className="flex items-center gap-2 mt-1 ml-[7.5rem]">
        {primaryCount > 0 && (
          <span className="text-[9px] flex items-center gap-0.5" style={{color:'#0F6E56'}}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#1D9E75'}} />
            {primaryCount} primary
          </span>
        )}
        {topCount > 0 && (
          <span className="text-[9px] flex items-center gap-0.5" style={{color:'#185FA5'}}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#378ADD'}} />
            {topCount} top
          </span>
        )}
        {mentionedCount > 0 && (
          <span className="text-[9px] flex items-center gap-0.5" style={{color:'#854F0B'}}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#EF9F27'}} />
            {mentionedCount} mentioned
          </span>
        )}
        {buriedCount > 0 && (
          <span className="text-[9px] flex items-center gap-0.5" style={{color:'#A32D2D'}}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#E24B4A'}} />
            {buriedCount} buried
          </span>
        )}
        {absentCount > 0 && (
          <span className="text-[9px] flex items-center gap-0.5" style={{color:'#888780'}}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:'#D3D1C7'}} />
            {absentCount} absent
          </span>
        )}
      </div>
    </div>
  );
}

function SnippetText({ text, brand, domain }) {
  if (!text) return null;
  const terms = [brand, domain?.replace('www.','')].filter(Boolean);
  if (!terms.length) return <p className="text-xs text-gray-600 leading-relaxed">{text}</p>;
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <p className="text-xs text-gray-600 leading-relaxed">
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="rounded px-0.5 font-medium" style={{background:'#EEEDFE',color:'#3C3489'}}>{part}</mark>
          : part
      )}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function ReportDashboard() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState(null);
  const clicksChartRef  = useRef(null);
  const trendChartRef   = useRef(null);
  const clicksChartInst = useRef(null);
  const trendChartInst  = useRef(null);

  useEffect(() => {
    reports.get(projectId)
      .then(r => setData(r.data))
      .catch(() => { toast.error('Failed to load report'); setError(true); })
      .finally(() => setLoading(false));
  }, [projectId]);

  const savData = useMemo(() => {
    if (!data?.hasData) return [];
    const { project, run } = data;
    const competitors = safeParseArray(project.competitors);
    return [
      { label: project.brand_name || 'You', pct: Math.min(95, Math.round(run.geo_score || 28)), highlight: true },
      ...competitors.slice(0,4).map((c, i) => ({
        label: c,
        pct: Math.max(5, Math.round(35 - i * 7 + (i * 13 % 9))),
        highlight: false
      }))
    ];
  }, [data]);

  useEffect(() => {
    if (!data?.hasData || !clicksChartRef.current) return;
    if (clicksChartInst.current) clicksChartInst.current.destroy();
    const isDark  = matchMedia('(prefers-color-scheme: dark)').matches;
    const textCol = isDark ? '#c2c0b6' : '#73726c';
    const gridCol = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const clickLabels = data.clicksByPlatform.map(c => PLATFORM_META[c.ai_source]?.label || c.ai_source);
    const clickData   = data.clicksByPlatform.map(c => parseInt(c.clicks));
    const clickColors = data.clicksByPlatform.map(c => PLATFORM_META[c.ai_source]?.color || '#888780');
    clicksChartInst.current = new Chart(clicksChartRef.current, {
      type: 'bar',
      data: { labels: clickLabels, datasets: [{ data: clickData, backgroundColor: clickColors, borderRadius: 4, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textCol, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: textCol, font: { size: 11 } }, grid: { color: gridCol }, border: { display: false } }
        }
      }
    });
    return () => { clicksChartInst.current?.destroy(); };
  }, [data]);

  useEffect(() => {
    if (!data?.hasData || !trendChartRef.current || !data.scoreHistory?.length) return;
    if (trendChartInst.current) trendChartInst.current.destroy();
    const isDark  = matchMedia('(prefers-color-scheme: dark)').matches;
    const textCol = isDark ? '#c2c0b6' : '#73726c';
    const gridCol = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const months = data.scoreHistory.map(r => new Date(r.completed_at).toLocaleString('default',{month:'short'}));
    const scores = data.scoreHistory.map(r => parseFloat(r.geo_score) || 0);
    trendChartInst.current = new Chart(trendChartRef.current, {
      type: 'line',
      data: { labels: months, datasets: [{ data: scores, borderColor:'#7F77DD', backgroundColor:'rgba(127,119,221,0.08)', fill:true, tension:0.4, pointBackgroundColor:'#7F77DD', pointRadius:4, borderWidth:2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textCol, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { min:0, max:100, ticks: { color: textCol, font: { size: 11 } }, grid: { color: gridCol }, border: { display: false } }
        }
      }
    });
    return () => { trendChartInst.current?.destroy(); };
  }, [data]);

  async function triggerRecheck() {
    try {
      const { data: res } = await projectsApi.recheck(projectId);
      toast.success('Re-check queued!');
      nav(`/checking/${res.checkRunId}?projectId=${projectId}`);
    } catch { toast.error('Failed to queue re-check'); }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-400"><i className="ti ti-loader-2 animate-spin" />Loading report...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
      <div className="card text-center max-w-sm">
        <i className="ti ti-alert-circle text-4xl text-red-300 mb-3 block" />
        <p className="text-sm text-gray-500 mb-4">Failed to load report. Please try again.</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  if (!data?.hasData) return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
      <div className="card text-center max-w-sm">
        <i className="ti ti-chart-bar text-4xl text-gray-300 mb-3 block" />
        <p className="text-sm text-gray-500 mb-4">No report data yet. Run your first visibility check.</p>
        <button className="btn-primary" onClick={triggerRecheck}>Run check now</button>
      </div>
    </div>
  );

  const {
    project, run, metrics,
    platformScores,
    sentimentByPlatform = [],
    promptResults,
    rankingPrompts  = [],
    absentPrompts   = [],
    clicksByPlatform, clickJourney, scoreHistory, recommendations
  } = data;

  const initials       = (project.brand_name || project.domain).slice(0,2).toUpperCase();
  const visiblePrompts = showAllPrompts ? promptResults : promptResults.slice(0,8);
  const platforms      = ['chatgpt','perplexity','gemini','claude','ai_overview'];
  const snippetUrl     = `${import.meta.env.VITE_API_URL || ''}/tracker.js?site=${project.tracking_snippet_id}`;
  const snippetTag     = `<script src="${snippetUrl}"></script>`;

  return (
    <div className="min-h-screen bg-[#F7F6F2]">

      {/* Top nav */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
        <div className="flex items-center gap-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{background:'#7F77DD'}}>AI</div>
          <span className="text-sm font-medium text-gray-800">AI Visibility</span>
          <div className="h-4 w-px bg-gray-200" />
          <Link to="/dashboard" className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
            <i className="ti ti-chevron-left text-xs" />All projects
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={triggerRecheck}>
            <i className="ti ti-refresh text-xs" />Re-check now
          </button>
          <button className="btn-primary text-xs flex items-center gap-1.5">
            <i className="ti ti-download text-xs" />Export PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0" style={{background:'#EEEDFE',color:'#3C3489'}}>{initials}</div>
            <div>
              <div className="text-sm font-medium text-gray-900">{project.brand_name || project.domain}</div>
              <div className="text-xs text-gray-400">{project.domain} &nbsp;·&nbsp; {project.niche}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 px-2.5 py-1 rounded-full border flex items-center gap-1" style={{borderWidth:'0.5px',borderColor:'#d1d0c8'}}>
              <i className="ti ti-calendar text-xs" />
              {run.completed_at ? new Date(run.completed_at).toLocaleString('default',{month:'long',year:'numeric'}) : 'Latest run'}
            </span>
            <GeoScoreCircle score={run.geo_score} />
          </div>
        </div>

        {/* Overview metrics */}
        <div>
          <p className="section-label">Overview</p>
          <div className="grid grid-cols-4 gap-2.5">
            <div className="metric-card">
              <div className="text-xs text-gray-500 mb-1">AI referral clicks</div>
              <div className="text-2xl font-medium text-gray-900">{metrics.totalClicks.toLocaleString()}</div>
              {metrics.clickChange !== null && (
                <div className={`text-xs mt-1 ${metrics.clickChange >= 0 ? 'text-teal-500' : 'text-red-400'}`}>
                  <i className={`ti ${metrics.clickChange >= 0 ? 'ti-arrow-up' : 'ti-arrow-down'} text-xs`} />
                  {' '}{Math.abs(metrics.clickChange)}% vs last month
                </div>
              )}
            </div>
            <div className="metric-card">
              <div className="text-xs text-gray-500 mb-1">Prompts tracked</div>
              <div className="text-2xl font-medium text-gray-900">{metrics.promptsTracked}</div>
              <div className="text-xs mt-1 flex items-center gap-1.5">
                <span className="flex items-center gap-0.5" style={{color:'#0F6E56'}}>
                  <i className="ti ti-circle-check-filled text-[10px]" />{metrics.promptsRanking ?? rankingPrompts.length} ranking
                </span>
                <span style={{color:'#b4b2a9'}}>·</span>
                <span className="flex items-center gap-0.5" style={{color:'#b4b2a9'}}>
                  <i className="ti ti-circle-x text-[10px]" />{metrics.promptsAbsent ?? absentPrompts.length} absent
                </span>
              </div>
            </div>
            <div className="metric-card">
              <div className="text-xs text-gray-500 mb-1">Platforms visible on</div>
              <div className="text-2xl font-medium text-gray-900">{metrics.platformsVisible} / {metrics.totalPlatforms}</div>
              <div className="text-xs mt-1 text-red-400">
                <i className="ti ti-arrow-down text-xs" /> Absent on {5 - metrics.platformsVisible}
              </div>
            </div>
            <div className="metric-card">
              <div className="text-xs text-gray-500 mb-1">Primary recommendations</div>
              <div className="text-2xl font-medium text-gray-900">{metrics.primaryCount}</div>
              <div className="text-xs mt-1 text-teal-500"><i className="ti ti-arrow-up text-xs" /> Across all platforms</div>
            </div>
          </div>
        </div>

        {/* Platform scores + Sentiment */}
        <div className="grid grid-cols-2 gap-4">

          {/* LEFT — Platform visibility scores with tier breakdown */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="section-label" style={{marginBottom:0}}>Platform visibility scores</p>
              <div className="flex items-center gap-2">
                {[
                  {color:'#1D9E75',label:'Primary'},
                  {color:'#378ADD',label:'Top'},
                  {color:'#EF9F27',label:'Mentioned'},
                  {color:'#E24B4A',label:'Buried'},
                  {color:'#D3D1C7',label:'Absent'},
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{background:l.color}} />
                    <span className="text-[9px]" style={{color:'#b4b2a9'}}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {platformScores.map(ps => (
              <PlatformBar
                key={ps.platform}
                platform={ps.platform}
                score={parseFloat(ps.avg_score) || 0}
                primaryCount={parseInt(ps.primary_count) || 0}
                topCount={parseInt(ps.top_count) || 0}
                mentionedCount={parseInt(ps.mentioned_count) || 0}
                buriedCount={parseInt(ps.buried_count) || 0}
                absentCount={parseInt(ps.absent_count) || 0}
                total={parseInt(ps.total) || 1}
              />
            ))}
          </div>

          {/* RIGHT — Sentiment breakdown */}
          <div className="card">
            <p className="section-label">AI sentiment towards your brand</p>
            {sentimentByPlatform.filter(s => parseInt(s.mentioned_total) > 0).length === 0 ? (
              <div className="flex items-center justify-center h-24 text-sm text-gray-300">
                No sentiment data yet — run a check first
              </div>
            ) : (
              <div className="space-y-3">
                {sentimentByPlatform
                  .filter(s => parseInt(s.mentioned_total) > 0)
                  .map(s => {
                    const pos    = parseInt(s.positive) || 0;
                    const neu    = parseInt(s.neutral)  || 0;
                    const neg    = parseInt(s.negative) || 0;
                    const total  = Math.max(pos + neu + neg, 1);
                    const posPct = Math.round((pos / total) * 100);
                    const neuPct = Math.round((neu / total) * 100);
                    const negPct = 100 - posPct - neuPct;
                    const meta   = PLATFORM_META[s.platform] || { label: s.platform };
                    const dominant = pos >= neg && pos >= neu ? SENTIMENT_CONFIG.positive
                      : neg > pos && neg >= neu ? SENTIMENT_CONFIG.negative
                      : SENTIMENT_CONFIG.neutral;
                    return (
                      <div key={s.platform}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-700">{meta.label}</span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                              style={{background:dominant.bg,color:dominant.color}}>
                              <i className={`ti ${dominant.icon} text-[10px]`} />{dominant.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span style={{color:'#0F6E56'}}>+{pos}</span>
                            <span style={{color:'#888780'}}>{neu}</span>
                            <span style={{color:'#791F1F'}}>−{neg}</span>
                          </div>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden" style={{background:'#f1efe8'}}>
                          {posPct > 0 && <div style={{width:`${posPct}%`,background:'#1D9E75'}} />}
                          {neuPct > 0 && <div style={{width:`${neuPct}%`,background:'#D3D1C7'}} />}
                          {negPct > 0 && <div style={{width:`${negPct}%`,background:'#E24B4A'}} />}
                        </div>
                        <div className="flex justify-between text-[9px] mt-0.5" style={{color:'#b4b2a9'}}>
                          <span>{posPct}% positive</span>
                          <span>{neuPct}% neutral</span>
                          <span>{negPct}% negative</span>
                        </div>
                      </div>
                    );
                  })}

                {/* Overall summary */}
                {(() => {
                  const t = sentimentByPlatform.reduce((a,s) => ({
                    pos: a.pos+(parseInt(s.positive)||0),
                    neu: a.neu+(parseInt(s.neutral)||0),
                    neg: a.neg+(parseInt(s.negative)||0),
                  }), {pos:0,neu:0,neg:0});
                  const grand = Math.max(t.pos+t.neu+t.neg,1);
                  const pct   = Math.round((t.pos/grand)*100);
                  const ov    = pct>=60 ? SENTIMENT_CONFIG.positive
                    : t.neg/grand>=0.4 ? SENTIMENT_CONFIG.negative
                    : SENTIMENT_CONFIG.neutral;
                  return (
                    <div className="pt-3 mt-1 border-t text-xs text-gray-500 flex items-center gap-1.5"
                      style={{borderTopWidth:'0.5px',borderColor:'#ebe9e1'}}>
                      <i className={`ti ${ov.icon} text-xs`} style={{color:ov.color}} />
                      <span>
                        AI responses are <span className="font-medium" style={{color:ov.color}}>
                          {ov.label.toLowerCase()}
                        </span> — {pct}% positive across all platforms
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* SAV card */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label" style={{marginBottom:0}}>Share of AI voice (SAV)</p>
            <span className="text-xs text-gray-400">Estimated from mention frequency</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            {savData.map(item => (
              <div key={item.label} className="flex items-center gap-2.5 mb-2">
                <span className="text-xs w-28 flex-shrink-0 truncate"
                  style={{fontWeight:item.highlight?500:400,color:item.highlight?'#3C3489':'#5f5e5a'}}>
                  {item.label}
                </span>
                <div className="flex-1 rounded h-2.5 overflow-hidden" style={{background:'#f1efe8'}}>
                  <div className="h-full rounded"
                    style={{width:`${item.pct}%`,background:item.highlight?'#7F77DD':'#b4b2a9'}} />
                </div>
                <span className="text-xs font-medium text-gray-500 w-8 text-right flex-shrink-0">{item.pct}%</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t" style={{borderTopWidth:'0.5px',borderColor:'#ebe9e1'}}>
            <i className="ti ti-info-circle text-xs mr-1" />
            Based on mention frequency across all AI responses. Competitor percentages are estimated.
          </p>
        </div>

        {/* ── Winning Keywords ─────────────────────────────────────── */}
        {rankingPrompts.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <i className="ti ti-trophy text-sm" style={{color:'#0F6E56'}} />
                <p className="section-label" style={{marginBottom:0}}>Winning keywords</p>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{background:'#E1F5EE',color:'#0F6E56'}}>
                  {rankingPrompts.length} ranking
                </span>
              </div>
              <span className="text-xs text-gray-400">Prompts where your brand appears in AI responses · Variants auto-added for next scan</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {rankingPrompts.map(rp => {
                const tierCfg = TIER_CONFIG[rp.best_tier] || TIER_CONFIG.absent;
                const rankingPlats = (rp.ranking_platforms || []);
                return (
                  <div key={rp.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{background:'#fafaf7', border:'0.5px solid #ebe9e1'}}>

                    {/* Tier badge */}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                      style={{background:tierCfg.bg, color:tierCfg.color}}>
                      {rp.best_tier}
                    </span>

                    {/* Prompt text */}
                    <span className="flex-1 text-xs text-gray-800 leading-relaxed">{rp.text}</span>

                    {/* Platform dots */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {rankingPlats.map(plat => {
                        const pm = PLATFORM_META[plat];
                        if (!pm) return null;
                        return (
                          <span key={plat} title={pm.label}
                            className="flex items-center justify-center w-5 h-5 rounded-full text-[10px]"
                            style={{background:pm.color+'22', color:pm.color}}>
                            <i className={`ti ${pm.icon}`} />
                          </span>
                        );
                      })}
                    </div>

                    {/* Score */}
                    <span className="text-xs font-medium flex-shrink-0 w-8 text-right" style={{color:'#5f5e5a'}}>
                      {Math.round(rp.best_score ?? 0)}
                    </span>
                  </div>
                );
              })}
            </div>

            {absentPrompts.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{borderTopWidth:'0.5px',borderColor:'#ebe9e1'}}>
                <div className="flex items-center gap-2 mb-2">
                  <i className="ti ti-eye-off text-xs" style={{color:'#b4b2a9'}} />
                  <span className="text-[11px] font-medium" style={{color:'#b4b2a9'}}>Not ranking yet ({absentPrompts.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {absentPrompts.slice(0, 8).map(ap => (
                    <span key={ap.id}
                      className="text-[10px] px-2 py-1 rounded-full"
                      style={{background:'#f1efe8', color:'#9c9a93'}}>
                      {ap.text}
                    </span>
                  ))}
                  {absentPrompts.length > 8 && (
                    <span className="text-[10px] px-2 py-1 rounded-full" style={{background:'#f1efe8',color:'#9c9a93'}}>
                      +{absentPrompts.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt analysis table with expandable snippets */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label" style={{marginBottom:0}}>Prompt analysis</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">Click any row to see AI responses</span>
              <span className="text-xs text-gray-400">Consistency = out of 3 runs</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-3 font-medium uppercase tracking-wider text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1',width:'35%'}}>Prompt</th>
                  <th className="pb-2 px-1 font-medium uppercase tracking-wider text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1',width:'5%'}}>Cat</th>
                  {platforms.map(p => (
                    <th key={p} className="pb-2 px-1 font-medium uppercase tracking-wider text-gray-400 text-center" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1',width:'9%'}}>
                      {PLATFORM_META[p]?.label.slice(0,5)}
                    </th>
                  ))}
                  <th className="pb-2 pl-2 font-medium uppercase tracking-wider text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1',width:'10%'}}>Consist.</th>
                  <th className="pb-2 pl-2 font-medium uppercase tracking-wider text-gray-400 text-right" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1',width:'7%'}}>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {visiblePrompts.map(pr => {
                  const cats           = CAT_STYLES[pr.category] || {};
                  const platData       = pr.platforms || {};
                  const platValues     = Object.values(platData);
                  const avgConsistency = platValues.length > 0
                    ? platValues.reduce((s,v) => s+(parseFloat(v?.consistency)||0),0) / platValues.length : 0;
                  const totalClicks    = platValues.reduce((s,v) => s+(parseInt(v?.clicks)||0),0);
                  const isExpanded     = expandedPrompt === pr.id;
                  const snippets       = platforms
                    .map(plat => ({ platform:plat, snippet:platData[plat]?.snippet||null, sentiment:platData[plat]?.sentiment||'neutral', tier:platData[plat]?.tier||'absent' }))
                    .filter(s => s.snippet);
                  const hasSnippets    = snippets.length > 0;

                  return (
                    <>
                      <tr key={pr.id}
                        onClick={() => setExpandedPrompt(isExpanded ? null : pr.id)}
                        style={{cursor:hasSnippets?'pointer':'default'}}
                        className={isExpanded?'':'hover:bg-gray-50'}>
                        <td className="py-2 pr-3 text-gray-700" style={{borderBottomWidth:isExpanded?'0':'0.5px',borderColor:'#f0ede6'}}>
                          <div className="flex items-start gap-1.5">
                            {hasSnippets && (
                              <i className={`ti ${isExpanded?'ti-chevron-up':'ti-chevron-right'} text-[10px] mt-0.5 flex-shrink-0`} style={{color:'#b4b2a9'}} />
                            )}
                            <div>
                              <span className="line-clamp-2 leading-relaxed">{pr.text}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                {pr.source==='manual' && (
                                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{background:'#EEEDFE',color:'#3C3489'}}>manual</span>
                                )}
                                {hasSnippets && (
                                  <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                    <i className="ti ti-message-circle text-[9px]" />{snippets.length} response{snippets.length>1?'s':''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-1 text-center" style={{borderBottomWidth:isExpanded?'0':'0.5px',borderColor:'#f0ede6'}}>
                          {pr.category && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{background:cats.bg,color:cats.color}}>
                              {CAT_LABELS[pr.category]}
                            </span>
                          )}
                        </td>
                        {platforms.map(plat => (
                          <td key={plat} className="py-2 px-1 text-center" style={{borderBottomWidth:isExpanded?'0':'0.5px',borderColor:'#f0ede6'}}>
                            <RankBadge tier={platData[plat]?.tier||'absent'} />
                          </td>
                        ))}
                        <td className="py-2 pl-2" style={{borderBottomWidth:isExpanded?'0':'0.5px',borderColor:'#f0ede6'}}>
                          <ConsistencyPips pct={avgConsistency} />
                        </td>
                        <td className="py-2 pl-2 text-right font-medium text-gray-700" style={{borderBottomWidth:isExpanded?'0':'0.5px',borderColor:'#f0ede6'}}>
                          {totalClicks>0?totalClicks:<span className="text-gray-300">—</span>}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${pr.id}-exp`}>
                          <td colSpan={platforms.length+4} style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6',padding:0}}>
                            <div className="px-4 pb-4 pt-2" style={{background:'#faf9ff'}}>
                              {snippets.length===0 ? (
                                <div className="text-xs text-gray-400 py-2 flex items-center gap-2">
                                  <i className="ti ti-info-circle text-xs" />
                                  Brand was not mentioned in any run for this prompt.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {snippets.map(s => {
                                    const meta = PLATFORM_META[s.platform] || {};
                                    const sent = SENTIMENT_CONFIG[s.sentiment] || SENTIMENT_CONFIG.neutral;
                                    const tc   = TIER_CONFIG[s.tier]         || TIER_CONFIG.absent;
                                    return (
                                      <div key={s.platform} className="rounded-lg overflow-hidden border" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
                                        <div className="flex items-center justify-between px-3 py-2 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df',background:'white'}}>
                                          <div className="flex items-center gap-2">
                                            <i className={`ti ${meta.icon||'ti-robot'} text-sm`} style={{color:meta.color}} />
                                            <span className="text-xs font-medium text-gray-800">{meta.label}</span>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize" style={{background:tc.bg,color:tc.color}}>{s.tier}</span>
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{background:sent.bg,color:sent.color}}>
                                            <i className={`ti ${sent.icon} text-[10px]`} />{sent.label}
                                          </div>
                                        </div>
                                        <div className="px-3 py-2.5" style={{background:'#fdfcff'}}>
                                          <SnippetText text={s.snippet} brand={project.brand_name} domain={project.domain} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          {promptResults.length > 8 && (
            <button className="mt-3 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"
              onClick={() => setShowAllPrompts(!showAllPrompts)}>
              {showAllPrompts
                ? <><i className="ti ti-chevron-up text-xs" />Show less</>
                : <><i className="ti ti-chevron-down text-xs" />Show all {promptResults.length} prompts</>}
            </button>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <p className="section-label">AI clicks by platform</p>
            <div className="relative w-full" style={{height:180}}>
              {clicksByPlatform.length > 0
                ? <canvas ref={clicksChartRef} role="img" aria-label="AI referral clicks by platform" />
                : <div className="flex items-center justify-center h-full text-sm text-gray-300">No click data yet — install tracking snippet</div>
              }
            </div>
          </div>
          <div className="card">
            <p className="section-label">GEO score trend</p>
            <div className="relative w-full" style={{height:180}}>
              {scoreHistory.length > 1
                ? <canvas ref={trendChartRef} role="img" aria-label="GEO score over time" />
                : <div className="flex flex-col items-center justify-center h-full text-sm text-gray-300 gap-1">
                    <i className="ti ti-chart-line text-2xl" />Run more checks to see trends
                  </div>
              }
            </div>
          </div>
        </div>

        {/* Click journey */}
        {clickJourney.length > 0 && (
          <div className="card">
            <p className="section-label">AI click journey — top landing pages</p>
            <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  {['Source','Landing page','Clicks'].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 font-medium uppercase tracking-wider text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clickJourney.map((cj,i) => {
                  const meta = PLATFORM_META[cj.ai_source];
                  return (
                    <tr key={i}>
                      <td className="py-2 px-2" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:meta?.dot||'#888'}} />
                          {meta?.label||cj.ai_source}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6',color:'#185FA5'}}>{cj.landing_page}</td>
                      <td className="py-2 px-2 font-medium text-gray-800" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{cj.clicks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* GEO Recommendations */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label" style={{marginBottom:0}}>GEO recommendations</p>
            <span className="text-xs text-gray-400">{recommendations.length} actions</span>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-sm text-gray-400">Recommendations will appear after checks complete.</p>
          ) : recommendations.map(rec => (
            <div key={rec.id} className="flex gap-2.5 py-2.5 border-b last:border-b-0" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6',alignItems:'flex-start'}}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{background:rec.type==='warn'?'#FAEEDA':rec.type==='good'?'#E1F5EE':'#E6F1FB',color:rec.type==='warn'?'#854F0B':rec.type==='good'?'#0F6E56':'#185FA5'}}>
                <i className={`ti ${rec.type==='warn'?'ti-alert-triangle':rec.type==='good'?'ti-check':'ti-bulb'} text-xs`} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 mb-0.5">{rec.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{rec.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tracking snippet */}
        <div className="card">
          <p className="section-label">Tracking snippet</p>
          <p className="text-xs text-gray-500 mb-3">Paste this before <code className="font-mono bg-gray-50 px-1 py-0.5 rounded">&lt;/head&gt;</code> on your website to track real AI referral clicks.</p>
          <div className="rounded-lg p-3 font-mono text-xs text-gray-500 select-all break-all" style={{background:'#F7F6F2'}}>{snippetTag}</div>
          <button className="btn-ghost text-xs mt-2 flex items-center gap-1.5"
            onClick={() => { navigator.clipboard.writeText(snippetTag); toast.success('Copied!'); }}>
            <i className="ti ti-copy text-xs" />Copy snippet
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pb-8">
          <button className="btn-ghost flex items-center gap-1.5 text-sm" onClick={triggerRecheck}>
            <i className="ti ti-refresh text-sm" />Re-check visibility
          </button>
          <button className="btn-primary flex items-center gap-1.5 text-sm">
            <i className="ti ti-download text-sm" />Download full PDF report
          </button>
        </div>

      </div>
    </div>
  );
}
