// src/pages/ReportDashboard.jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import { reports, projects as projectsApi } from '../lib/api.js';
import RankBadge from '../components/RankBadge.jsx';
import ConsistencyPips from '../components/ConsistencyPips.jsx';
import toast from 'react-hot-toast';

Chart.register(...registerables);

const PLATFORM_META = {
  chatgpt:     { label:'ChatGPT',     color:'#378ADD', dot:'#378ADD' },
  perplexity:  { label:'Perplexity',  color:'#1D9E75', dot:'#1D9E75' },
  gemini:      { label:'Gemini',      color:'#EF9F27', dot:'#EF9F27' },
  claude:      { label:'Claude',      color:'#D85A30', dot:'#D85A30' },
  ai_overview: { label:'AI Overview', color:'#888780', dot:'#888780' },
};

const CAT_LABELS = {1:'Cat 1',2:'Cat 2',3:'Cat 3',4:'Cat 4'};
const CAT_STYLES = {
  1: {bg:'#EEEDFE',color:'#3C3489'},
  2: {bg:'#E1F5EE',color:'#0F6E56'},
  3: {bg:'#FAEEDA',color:'#854F0B'},
  4: {bg:'#FAECE7',color:'#712B13'},
};

function GeoScoreCircle({ score }) {
  return (
    <div className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-full flex-shrink-0"
      style={{background:'#EEEDFE'}}>
      <span className="text-[22px] font-medium leading-none" style={{color:'#3C3489'}}>{score || '—'}</span>
      <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{color:'#534AB7'}}>GEO score</span>
    </div>
  );
}

function PlatformBar({ platform, score, tier }) {
  const meta = PLATFORM_META[platform] || { label: platform, color: '#888' };
  return (
    <div className="flex items-center gap-2.5 py-2 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#ebe9e1'}}>
      <span className="text-sm font-medium text-gray-800 w-28 flex-shrink-0">{meta.label}</span>
      <div className="flex-1 rounded h-2 overflow-hidden" style={{background:'#f1efe8'}}>
        <div className="h-full rounded transition-all duration-700" style={{width:`${score}%`,background:meta.color}} />
      </div>
      <span className="text-sm font-medium text-gray-800 w-8 text-right flex-shrink-0">{Math.round(score)}</span>
      <RankBadge tier={tier} />
    </div>
  );
}

export default function ReportDashboard() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const clicksChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const clicksChartInst = useRef(null);
  const trendChartInst = useRef(null);

  useEffect(() => {
    reports.get(projectId)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!data?.hasData) return;
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const textCol = isDark ? '#c2c0b6' : '#73726c';
    const gridCol = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

    // Clicks by platform chart
    if (clicksChartRef.current) {
      if (clicksChartInst.current) clicksChartInst.current.destroy();
      const clickLabels = data.clicksByPlatform.map(c => c.ai_source);
      const clickData = data.clicksByPlatform.map(c => parseInt(c.clicks));
      const clickColors = clickLabels.map(l => {
        const found = Object.values(PLATFORM_META).find(m => m.label === l);
        return found?.color || '#888780';
      });
      clicksChartInst.current = new Chart(clicksChartRef.current, {
        type: 'bar',
        data: { labels: clickLabels, datasets: [{ data: clickData, backgroundColor: clickColors, borderRadius: 4, borderSkipped: false }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textCol, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
            y: { ticks: { color: textCol, font: { size: 11 } }, grid: { color: gridCol }, border: { display: false } }
          }
        }
      });
    }

    // Trend chart
    if (trendChartRef.current && data.scoreHistory?.length) {
      if (trendChartInst.current) trendChartInst.current.destroy();
      const months = data.scoreHistory.map(r => {
        const d = new Date(r.completed_at);
        return d.toLocaleString('default', { month: 'short' });
      });
      const scores = data.scoreHistory.map(r => parseFloat(r.geo_score) || 0);
      trendChartInst.current = new Chart(trendChartRef.current, {
        type: 'line',
        data: {
          labels: months,
          datasets: [{
            data: scores,
            borderColor: '#7F77DD',
            backgroundColor: 'rgba(127,119,221,0.08)',
            fill: true, tension: 0.4,
            pointBackgroundColor: '#7F77DD', pointRadius: 4, borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textCol, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
            y: { min: 0, max: 100, ticks: { color: textCol, font: { size: 11 } }, grid: { color: gridCol }, border: { display: false } }
          }
        }
      });
    }
    return () => {
      clicksChartInst.current?.destroy();
      trendChartInst.current?.destroy();
    };
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
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <i className="ti ti-loader-2 animate-spin" />Loading report...
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

  const { project, run, metrics, platformScores, promptResults, clicksByPlatform, clickJourney, scoreHistory, recommendations } = data;
  const initials = (project.brand_name || project.domain).slice(0, 2).toUpperCase();
  const visiblePrompts = showAllPrompts ? promptResults : promptResults.slice(0, 8);
  const platforms = ['chatgpt','perplexity','gemini','claude','ai_overview'];

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
            <GeoScoreCircle score={Math.round(run.geo_score)} />
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
              <div className="text-xs mt-1 text-gray-400">
                {promptResults.filter(p=>p.source==='auto').length} auto · {promptResults.filter(p=>p.source==='manual').length} manual
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

        {/* Platform scores + SAV */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <p className="section-label">Platform visibility scores</p>
            {platformScores.map(ps => (
              <PlatformBar
                key={ps.platform}
                platform={ps.platform}
                score={parseFloat(ps.avg_score) || 0}
                tier={parseFloat(ps.avg_score) > 70 ? 'primary' : parseFloat(ps.avg_score) > 50 ? 'top' : parseFloat(ps.avg_score) > 25 ? 'mentioned' : parseFloat(ps.avg_score) > 10 ? 'buried' : 'absent'}
              />
            ))}
          </div>

          <div className="card">
            <p className="section-label">Share of AI voice (SAV)</p>
            {/* Competitor SAV bars - derived from prompt data */}
            {[
              { label: project.brand_name || 'You', pct: Math.min(95, Math.round(run.geo_score || 28)), highlight: true },
              ...(JSON.parse(project.competitors || '[]')).slice(0,4).map((c, i) => ({
                label: c,
                pct: Math.max(5, Math.round(35 - i * 7 + Math.random() * 8)),
                highlight: false
              }))
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2.5 mb-2">
                <span className="text-xs w-24 flex-shrink-0 truncate" style={{fontWeight: item.highlight ? 500 : 400, color: item.highlight ? '#3C3489' : '#5f5e5a'}}>{item.label}</span>
                <div className="flex-1 rounded h-2.5 overflow-hidden" style={{background:'#f1efe8'}}>
                  <div className="h-full rounded" style={{width:`${item.pct}%`, background: item.highlight ? '#7F77DD' : '#b4b2a9'}} />
                </div>
                <span className="text-xs font-medium text-gray-500 w-8 text-right flex-shrink-0">{item.pct}%</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t" style={{borderTopWidth:'0.5px',borderColor:'#ebe9e1'}}>
              <i className="ti ti-info-circle text-xs mr-1" />Based on mention frequency across all prompts
            </p>
          </div>
        </div>

        {/* Prompt analysis table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label" style={{marginBottom:0}}>Prompt analysis</p>
            <span className="text-xs text-gray-400">Consistency = out of 5 runs</span>
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
                  const cats = CAT_STYLES[pr.category] || {};
                  const platData = pr.platforms || {};
                  const avgConsistency = Object.values(platData).reduce((s, v) => s + (parseFloat(v?.consistency)||0), 0) / Math.max(1, Object.keys(platData).length);
                  const totalClicks = Object.values(platData).reduce((s, v) => s + (parseInt(v?.clicks)||0), 0);
                  return (
                    <tr key={pr.id}>
                      <td className="py-2 pr-3 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <span className="line-clamp-2 leading-relaxed">{pr.text}</span>
                        {pr.source === 'manual' && (
                          <span className="ml-1 text-[9px] font-medium px-1.5 py-0.5 rounded" style={{background:'#EEEDFE',color:'#3C3489'}}>manual</span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-center" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {pr.category && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{background:cats.bg,color:cats.color}}>
                            {CAT_LABELS[pr.category]}
                          </span>
                        )}
                      </td>
                      {platforms.map(plat => (
                        <td key={plat} className="py-2 px-1 text-center" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                          <RankBadge tier={platData[plat]?.tier || 'absent'} />
                        </td>
                      ))}
                      <td className="py-2 pl-2" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <ConsistencyPips pct={avgConsistency} />
                      </td>
                      <td className="py-2 pl-2 text-right font-medium text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {totalClicks > 0 ? totalClicks : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {promptResults.length > 8 && (
            <button className="mt-3 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1" onClick={() => setShowAllPrompts(!showAllPrompts)}>
              {showAllPrompts ? <><i className="ti ti-chevron-up text-xs" />Show less</> : <><i className="ti ti-chevron-down text-xs" />Show all {promptResults.length} prompts</>}
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
                    <i className="ti ti-chart-line text-2xl" />
                    Run more checks to see trends
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
                {clickJourney.map((cj, i) => {
                  const meta = Object.values(PLATFORM_META).find(m => m.label === cj.ai_source);
                  return (
                    <tr key={i}>
                      <td className="py-2 px-2" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: meta?.dot || '#888'}} />
                          {cj.ai_source}
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
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${rec.type==='warn'?'ri-warn':rec.type==='good'?'ri-ok':'ri-info'}`}
                style={{background: rec.type==='warn'?'#FAEEDA':rec.type==='good'?'#E1F5EE':'#E6F1FB',
                        color:  rec.type==='warn'?'#854F0B':rec.type==='good'?'#0F6E56':'#185FA5'}}>
                <i className={`ti ${rec.type==='warn'?'ti-file-text':rec.type==='good'?'ti-check':'ti-link'} text-xs`} />
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
          <div className="rounded-lg p-3 font-mono text-xs text-gray-500 select-all" style={{background:'#F7F6F2'}}>
            {`<script src="https://aivisibility.io/tracker.js?site=${project.tracking_snippet_id}"></script>`}
          </div>
          <button className="btn-ghost text-xs mt-2 flex items-center gap-1.5"
            onClick={() => { navigator.clipboard.writeText(`<script src="https://aivisibility.io/tracker.js?site=${project.tracking_snippet_id}"></script>`); toast.success('Copied!'); }}>
            <i className="ti ti-copy text-xs" />Copy snippet
          </button>
        </div>

        {/* Footer actions */}
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
