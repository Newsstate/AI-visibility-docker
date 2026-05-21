// src/pages/RunningChecks.jsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { reports } from '../lib/api.js';

const ALL_PLATFORMS = [
  { key:'chatgpt',     label:'ChatGPT',     abbr:'GPT',  bg:'#E1F5EE', color:'#0F6E56' },
  { key:'perplexity',  label:'Perplexity',  abbr:'Pplx', bg:'#EEEDFE', color:'#3C3489' },
  { key:'gemini',      label:'Gemini',      abbr:'Gem',  bg:'#E6F1FB', color:'#185FA5' },
  { key:'claude',      label:'Claude',      abbr:'Cld',  bg:'#FAECE7', color:'#712B13' },
  { key:'ai_overview', label:'AI Overview', abbr:'SERP', bg:'#FAEEDA', color:'#854F0B' },
];

const TIER_COLORS = {
  primary:   { bg:'#E1F5EE', color:'#085041' },
  top:       { bg:'#E6F1FB', color:'#185FA5' },
  mentioned: { bg:'#FAEEDA', color:'#854F0B' },
  buried:    { bg:'#FCEBEB', color:'#A32D2D' },
  absent:    { bg:'#F1EFE8', color:'#5F5E5A' },
};

export default function RunningChecks() {
  const { runId } = useParams();
  const [sp] = useSearchParams();
  const projectId = sp.get('projectId');
  const nav = useNavigate();

  // ─── Read selected platforms from URL query param ─────────────
  // AddWebsite passes them as: /checking/RUN_ID?projectId=X&platforms=chatgpt,claude
  const platformsParam = sp.get('platforms');
  const activePlatforms = platformsParam
    ? ALL_PLATFORMS.filter(p => platformsParam.split(',').includes(p.key))
    : ALL_PLATFORMS;

  const [progress, setProgress] = useState({ completed: 0, total: 0, pct: 0, status: 'queued' });
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(`/api/reports/runs/${runId}/progress`, {
      withCredentials: true
    });

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);

      if (data.platform && data.promptText) {
        const tier   = data.tier || 'absent';
        const colors = TIER_COLORS[tier] || TIER_COLORS.absent;
        setLogs(prev => [{
          id: Date.now(),
          platform: ALL_PLATFORMS.find(p => p.key === data.platform)?.label || data.platform,
          prompt: data.promptText,
          tier, colors,
          ts: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 8));
      }

      if (data.status === 'completed') {
        es.close();
        setTimeout(() => nav(`/report/${projectId}`), 1500);
      }
      if (data.status === 'failed') es.close();
    };

    es.onerror = () => {
      es.close();
      const poll = setInterval(async () => {
        try {
          const { data } = await reports.getRunStatus(runId);
          setProgress({
            status: data.status,
            completed: data.completed_queries,
            total: data.total_queries,
            pct: data.total_queries > 0
              ? Math.round((data.completed_queries / data.total_queries) * 100)
              : 0
          });
          if (data.status === 'completed') {
            clearInterval(poll);
            setTimeout(() => nav(`/report/${projectId}`), 1500);
          }
          if (data.status === 'failed') clearInterval(poll);
        } catch {}
      }, 3000);
      return () => clearInterval(poll);
    };

    return () => es.close();
  }, [runId, projectId, nav]);

  useEffect(() => {
    logsRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [logs]);

  const isCompleted = progress.status === 'completed';
  const isFailed    = progress.status === 'failed';

  // ─── Dynamic subtitle using actual selected platforms ─────────
  const platformNames  = activePlatforms.map(p => p.label).join(', ');
  const platformCount  = activePlatforms.length;

  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4" style={{borderBottomWidth:'0.5px'}}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{background:'#7F77DD'}}>AI</div>
          <span className="text-sm font-medium text-gray-800">AI Visibility</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {['Add website', 'Running checks', 'Report'].map((label, i) => (
            <div key={i} className="flex items-center" style={{flex: i < 2 ? '1' : 'none'}}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                  style={i===0?{background:'#1D9E75',color:'#fff'}:i===1?{background:'#7F77DD',color:'#fff'}:{border:'0.5px solid #d1d0c8',color:'#aaa'}}>
                  {i===0 ? <i className="ti ti-check text-xs" /> : i+1}
                </div>
                <span className={`text-xs font-medium ${i<=1?'text-gray-800':'text-gray-400'}`}>{label}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px mx-3" style={{background: i===0?'#1D9E75':'#e0dfd7'}} />}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-base font-medium text-gray-900">Running AI visibility checks</h1>
              {/* ── Dynamic subtitle ── */}
              <p className="text-sm text-gray-500 mt-0.5">
                Checking all prompts across{' '}
                <span className="font-medium text-gray-700">{platformCount} platform{platformCount !== 1 ? 's' : ''}</span>
                {' '}—{' '}
                <span className="text-gray-400">{platformNames}</span>
              </p>
            </div>
            {isCompleted && (
              <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0" style={{background:'#E1F5EE',color:'#0F6E56'}}>
                <i className="ti ti-check text-xs" />Complete
              </span>
            )}
          </div>

          {/* ── Only show selected platform cards ── */}
          <div className={`grid gap-2 mb-5`} style={{gridTemplateColumns:`repeat(${platformCount}, 1fr)`}}>
            {activePlatforms.map(p => (
              <div key={p.key} className="border rounded-lg px-2 py-2.5 flex flex-col items-center gap-1.5 text-center"
                style={{borderWidth:'0.5px', borderColor:'#e8e6df'}}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0"
                  style={{background:p.bg, color:p.color}}>{p.abbr}</div>
                <span className="text-[10px] text-gray-500">{p.label}</span>
                <div className="w-full h-0.5 rounded bg-gray-100 overflow-hidden">
                  {!isCompleted && (
                    <div className="h-full rounded" style={{background:'#7F77DD', animation:'slideBar 1.4s ease-in-out infinite'}} />
                  )}
                </div>
                <span className="text-[10px] font-medium" style={{color: isCompleted ? '#1D9E75' : '#7F77DD'}}>
                  {isCompleted ? '✓ Done' : 'Checking...'}
                </span>
              </div>
            ))}
          </div>

          {/* Live log */}
          <div ref={logsRef} className="space-y-1.5 mb-4 max-h-48 overflow-hidden">
            {logs.length === 0 && (
              <div className="flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg text-gray-400" style={{background:'#F7F6F2'}}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:'#7F77DD', animation:'blink 1s ease-in-out infinite'}} />
                Initialising checks...
              </div>
            )}
            {logs.map(log => (
              <div key={log.id} className="flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg"
                style={{
                  background: log.tier==='absent'?'#FCEBEB': log.tier==='primary'||log.tier==='top'?'#E1F5EE':'#FAEEDA',
                  color:      log.tier==='absent'?'#791F1F': log.tier==='primary'||log.tier==='top'?'#085041':'#854F0B'
                }}>
                <i className={`ti flex-shrink-0 ${log.tier==='absent'?'ti-alert-triangle':'ti-check'} text-xs`} />
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-white/50">{log.platform}</span>
                <span className="truncate flex-1">"{log.prompt}"</span>
                <span className="font-medium flex-shrink-0 capitalize">{log.tier}</span>
              </div>
            ))}
          </div>

          {/* Overall progress */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Overall progress</span>
              <span>{progress.completed} / {progress.total || '...'} queries</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{width:`${progress.pct}%`, background:'#7F77DD'}} />
            </div>
          </div>

          {isFailed && (
            <div className="mt-4 p-3 rounded-lg text-sm" style={{background:'#FCEBEB',color:'#791F1F'}}>
              <i className="ti ti-alert-circle mr-2" />Check run failed. Please try again.
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-5 border-t" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}}>
            <span className="text-xs text-gray-400">
              {isCompleted
                ? 'Redirecting to report...'
                : `Est. ${Math.max(0, Math.round((progress.total - progress.completed) * 0.8))}s remaining`}
            </span>
            <button className="btn-primary flex items-center gap-2" onClick={() => nav(`/report/${projectId}`)}>
              <i className="ti ti-chart-bar text-sm" />
              View report dashboard
              <i className="ti ti-arrow-right text-sm" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideBar { 0%{width:0%;margin-left:0} 50%{width:60%} 100%{width:0%;margin-left:100%} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}
