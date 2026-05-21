// src/pages/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || '';

const PLATFORM_META = {
  chatgpt:     { label: 'ChatGPT',     color: '#378ADD', icon: 'ti-brand-openai' },
  perplexity:  { label: 'Perplexity',  color: '#1D9E75', icon: 'ti-search' },
  gemini:      { label: 'Gemini',      color: '#EF9F27', icon: 'ti-brand-google' },
  claude:      { label: 'Claude',      color: '#D85A30', icon: 'ti-robot' },
  ai_overview: { label: 'AI Overview', color: '#888780', icon: 'ti-layout-list' },
};

const COST_LABELS = {
  chatgpt:     'gpt-4o-mini',
  perplexity:  'sonar',
  gemini:      'gemini-1.5-flash',
  claude:      'claude-haiku',
  ai_overview: 'SerpAPI',
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Stat card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#7F77DD', icon }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
        {icon && <i className={`ti ${icon} text-base`} style={{color}} />}
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    completed: { bg: '#E1F5EE', color: '#0F6E56', label: 'Done' },
    failed:    { bg: '#FEECEC', color: '#B91C1C', label: 'Failed' },
    running:   { bg: '#EEEDFE', color: '#3C3489', label: 'Running' },
    queued:    { bg: '#F7F6F2', color: '#888780', label: 'Queued' },
  };
  const s = map[status] || map.queued;
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{background:s.bg,color:s.color}}>{s.label}</span>
  );
}

// ─── API health dot ───────────────────────────────────────────────
function HealthDot({ configured }) {
  return (
    <span className="w-2 h-2 rounded-full inline-block"
      style={{background: configured ? '#1D9E75' : '#D1D0C8'}} />
  );
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [users, setUsers] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [domainSearch, setDomainSearch] = useState('');
  const [domainData, setDomainData] = useState(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/overview'),
      apiFetch('/api/admin/users'),
      apiFetch('/api/admin/api-health'),
    ])
      .then(([overview, userList, healthData]) => {
        setData(overview);
        setUsers(userList);
        setHealth(healthData);
      })
      .catch(err => {
        if (err.message.includes('403')) {
          toast.error('Admin access required');
          nav('/dashboard');
        } else {
          toast.error('Failed to load admin data');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function searchDomain() {
    if (!domainSearch.trim()) return;
    setDomainLoading(true);
    setDomainData(null);
    try {
      const d = await apiFetch(`/api/admin/domain/${encodeURIComponent(domainSearch.trim())}`);
      setDomainData(d);
    } catch {
      toast.error('Domain not found');
    } finally {
      setDomainLoading(false);
    }
  }

  async function updatePlan(userId, plan) {
    setUpdatingPlan(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      if (!res.ok) throw new Error();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u));
      toast.success('Plan updated');
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setUpdatingPlan(null);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <i className="ti ti-loader-2 animate-spin" />Loading admin dashboard...
      </div>
    </div>
  );

  const { runs, users: userStats, projects, costs, platformCalls, recentRuns, runsByDay, topUsers } = data;

  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{background:'#D85A30'}}>
            <i className="ti ti-shield text-xs" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Admin Dashboard</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{background:'#FEECEC',color:'#B91C1C'}}>ADMIN ONLY</span>
        </div>
        <button onClick={() => nav('/dashboard')} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1">
          <i className="ti ti-arrow-left text-xs" />Back to app
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
        <div className="flex gap-0">
          {[
            { id:'overview', label:'Overview', icon:'ti-dashboard' },
            { id:'costs',    label:'API Costs', icon:'ti-coin' },
            { id:'runs',     label:'Check Runs', icon:'ti-activity' },
            { id:'users',    label:'Users', icon:'ti-users' },
            { id:'domain',   label:'Domain Lookup', icon:'ti-search' },
            { id:'health',   label:'API Health', icon:'ti-heart-rate-monitor' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors"
              style={{
                borderBottomColor: tab === t.id ? '#7F77DD' : 'transparent',
                color: tab === t.id ? '#3C3489' : '#888780'
              }}>
              <i className={`ti ${t.icon} text-xs`} />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Top stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Users"     value={userStats.total}     sub={`+${userStats.new_this_week} this week`}   icon="ti-users"       color="#7F77DD" />
              <StatCard label="Total Projects"  value={projects.total}      sub="Across all users"                          icon="ti-world"       color="#1D9E75" />
              <StatCard label="Check Runs"      value={runs.total}          sub={`${runs.runs_today} today`}                icon="ti-activity"    color="#378ADD" />
              <StatCard label="Est. Total Cost" value={`$${costs.total_estimated}`} sub={`~$${costs.per_run_avg} per run avg`} icon="ti-coin"   color="#EF9F27" />
            </div>

            {/* Run status breakdown */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Completed" value={runs.completed} icon="ti-check"        color="#1D9E75" sub={`${Math.round(runs.completed/Math.max(runs.total,1)*100)}% success rate`} />
              <StatCard label="Failed"    value={runs.failed}    icon="ti-alert-circle" color="#B91C1C" sub="Check logs for errors" />
              <StatCard label="Running"   value={runs.running}   icon="ti-loader-2"     color="#7F77DD" sub="Currently processing" />
              <StatCard label="Queued"    value={runs.queued}    icon="ti-clock"        color="#888780" sub="Waiting to start" />
            </div>

            {/* Runs by day */}
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Runs last 14 days</div>
              <div className="flex items-end gap-1.5 h-24">
                {runsByDay.length === 0
                  ? <div className="flex items-center justify-center w-full text-sm text-gray-300">No runs yet</div>
                  : runsByDay.map(d => {
                    const maxRuns = Math.max(...runsByDay.map(r => parseInt(r.runs)), 1);
                    const pct = Math.round((parseInt(d.runs) / maxRuns) * 100);
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                        <div className="relative w-full flex items-end justify-center" style={{height:80}}>
                          <div className="w-full rounded-t transition-all"
                            style={{height:`${Math.max(pct,4)}%`, background:'#7F77DD', opacity:0.8}}
                            title={`${d.runs} runs on ${d.date}`} />
                        </div>
                        <span className="text-[9px] text-gray-400">
                          {new Date(d.date).toLocaleDateString('default',{month:'short',day:'numeric'})}
                        </span>
                        <span className="text-[9px] font-medium text-gray-600">{d.runs}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Top users */}
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Top users by activity</div>
              <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    {['User','Plan','Projects','Runs','Queries','Est. Cost'].map(h => (
                      <th key={h} className="text-left pb-2 font-medium text-gray-400 uppercase tracking-wider"
                        style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topUsers.slice(0,10).map(u => (
                    <tr key={u.id}>
                      <td className="py-2 pr-4" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <div className="font-medium text-gray-800">{u.name || '—'}</div>
                        <div className="text-gray-400 text-[10px]">{u.email}</div>
                      </td>
                      <td className="py-2 pr-4" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
                          style={{background: u.plan==='free'?'#F7F6F2':u.plan==='pro'?'#EEEDFE':u.plan==='agency'?'#E1F5EE':'#FAEEDA',
                                  color:     u.plan==='free'?'#888780':u.plan==='pro'?'#3C3489':u.plan==='agency'?'#0F6E56':'#854F0B'}}>
                          {u.plan}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{u.projects}</td>
                      <td className="py-2 pr-4 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{u.runs}</td>
                      <td className="py-2 pr-4 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{parseInt(u.total_queries).toLocaleString()}</td>
                      <td className="py-2 font-medium text-gray-800" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        ${Math.round(parseInt(u.runs) * 0.40 * 100)/100}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── COSTS TAB ────────────────────────────────────────── */}
        {tab === 'costs' && (
          <div className="space-y-6">
            {/* Cost summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Total Estimated Cost" value={`$${costs.total_estimated}`}  icon="ti-coin"         color="#EF9F27" sub="All time" />
              <StatCard label="Avg Cost Per Run"     value={`$${costs.per_run_avg}`}      icon="ti-chart-bar"    color="#7F77DD" sub="Across all check runs" />
              <StatCard label="Total API Calls"      value={runs.total_queries?.toLocaleString()} icon="ti-api" color="#378ADD" sub="Across all platforms" />
            </div>

            {/* Per platform cost breakdown */}
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Cost breakdown by platform</div>
              <div className="space-y-3">
                {Object.entries(PLATFORM_META).map(([key, meta]) => {
                  const pData  = platformCalls.find(p => p.platform === key);
                  const calls  = pData?.calls || 0;
                  const cost   = pData?.cost  || 0;
                  const maxCost = Math.max(...platformCalls.map(p => p.cost), 0.01);
                  const pct    = Math.round((cost / maxCost) * 100);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <i className={`ti ${meta.icon} text-sm`} style={{color:meta.color}} />
                          <span className="text-xs font-medium text-gray-700">{meta.label}</span>
                          <span className="text-[10px] text-gray-400">({COST_LABELS[key]})</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-400">{calls.toLocaleString()} calls</span>
                          <span className="font-medium text-gray-800 w-16 text-right">${cost.toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${pct}%`,background:meta.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-scan fixed costs */}
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Fixed costs per scan (Claude Sonnet)</div>
              <div className="space-y-2">
                {[
                  { label:'Website analysis (crawl → analyze)',   cost: costs.analysis_per_scan, icon:'ti-brain' },
                  { label:'Prompt generation (16 prompts)',        cost: 0.004,                   icon:'ti-messages' },
                  { label:'AI recommendations (post-check)',       cost: costs.recs_per_run,      icon:'ti-bulb' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                    <div className="flex items-center gap-2">
                      <i className={`ti ${item.icon} text-xs text-gray-400`} />
                      <span className="text-xs text-gray-700">{item.label}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-800">${item.cost?.toFixed(4)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-medium text-gray-700">Total fixed per scan</span>
                  <span className="text-sm font-semibold text-gray-900">${(costs.analysis_per_scan + costs.recs_per_run).toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* Cost per run estimate */}
            <div className="rounded-xl border p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df',background:'#EEEDFE'}}>
              <div className="text-xs font-medium uppercase tracking-wider mb-3" style={{color:'#3C3489'}}>Estimated cost breakdown per full check run</div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label:'16 prompts × 5 platforms × 3 runs',  value:'240 API calls' },
                  { label:'Platform API costs',                  value:'~$0.25–0.35' },
                  { label:'Analysis + Recommendations',          value:'~$0.01' },
                  { label:'Total per run (all 5 platforms)',      value:'~$0.30–0.50' },
                  { label:'Total per run (2 platforms only)',     value:'~$0.10–0.15' },
                  { label:'SerpAPI (if enabled)',                 value:'+$0.24 (48 calls)' },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-lg p-3" style={{borderRadius:8}}>
                    <div className="text-[10px] text-gray-400 mb-1">{item.label}</div>
                    <div className="text-sm font-semibold" style={{color:'#3C3489'}}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RUNS TAB ──────────────────────────────────────────── */}
        {tab === 'runs' && (
          <div className="rounded-xl border bg-white overflow-hidden" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
              <span className="text-sm font-medium text-gray-900">Recent check runs</span>
              <span className="text-xs text-gray-400">Last 20 runs</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#F7F6F2'}}>
                    {['Domain','User','Status','Queries','GEO Score','Duration','Est. Cost','Date'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <div className="font-medium text-gray-800">{r.brand_name || r.domain}</div>
                        <div className="text-[10px] text-gray-400">{r.domain}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{r.email}</td>
                      <td className="px-4 py-2.5" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2.5 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {r.completed_queries}/{r.total_queries}
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6',color:'#3C3489'}}>
                        {r.geo_score ? Math.round(r.geo_score) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {r.duration_secs ? `${r.duration_secs}s` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        ${r.estimated_cost?.toFixed(4)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── USERS TAB ─────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="rounded-xl border bg-white overflow-hidden" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
              <span className="text-sm font-medium text-gray-900">All users ({users?.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#F7F6F2'}}>
                    {['User','Plan','Projects','Runs','Queries','Est. Cost','Joined','Last Run'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users?.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <div className="font-medium text-gray-800">{u.name || '—'}</div>
                        <div className="text-[10px] text-gray-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-2.5" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <select
                          value={u.plan}
                          disabled={updatingPlan === u.id}
                          onChange={e => updatePlan(u.id, e.target.value)}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize"
                          style={{borderWidth:'0.5px',borderColor:'#d1d0c8',background:'white'}}>
                          {['free','pro','agency','enterprise'].map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{u.projects}</td>
                      <td className="px-4 py-2.5 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{u.runs}</td>
                      <td className="px-4 py-2.5 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{parseInt(u.total_queries).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>${u.estimated_cost}</td>
                      <td className="px-4 py-2.5 text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        {u.last_run_at ? new Date(u.last_run_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DOMAIN LOOKUP TAB ────────────────────────────────── */}
        {tab === 'domain' && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Look up cost for a domain</div>
              <div className="flex gap-2">
                <input
                  value={domainSearch}
                  onChange={e => setDomainSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchDomain()}
                  placeholder="whitebunnie.com"
                  className="flex-1 text-sm"
                />
                <button onClick={searchDomain} disabled={domainLoading}
                  className="btn-primary flex items-center gap-2 flex-shrink-0">
                  {domainLoading
                    ? <><i className="ti ti-loader-2 animate-spin text-sm" />Searching...</>
                    : <><i className="ti ti-search text-sm" />Look up</>}
                </button>
              </div>
            </div>

            {domainData && (
              <>
                {/* Domain summary */}
                <div className="grid grid-cols-4 gap-4">
                  <StatCard label="Total Runs"       value={domainData.totalRuns}    icon="ti-activity" color="#7F77DD" />
                  <StatCard label="Total Queries"    value={domainData.totalQueries.toLocaleString()} icon="ti-api" color="#378ADD" />
                  <StatCard label="Total Est. Cost"  value={`$${domainData.totalCost}`} icon="ti-coin" color="#EF9F27" />
                  <StatCard label="Avg Cost/Run"     value={`$${domainData.totalRuns > 0 ? Math.round(domainData.totalCost/domainData.totalRuns*10000)/10000 : 0}`} icon="ti-chart-bar" color="#1D9E75" />
                </div>

                {/* Platform breakdown */}
                <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Platform API costs for this domain</div>
                  {domainData.platformCosts.map(pc => {
                    const meta = PLATFORM_META[pc.platform] || {};
                    return (
                      <div key={pc.platform} className="flex items-center justify-between py-2 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                        <div className="flex items-center gap-2">
                          <i className={`ti ${meta.icon} text-sm`} style={{color:meta.color}} />
                          <span className="text-xs font-medium text-gray-700">{meta.label || pc.platform}</span>
                        </div>
                        <div className="flex items-center gap-6 text-xs">
                          <span className="text-gray-400">{pc.calls} calls</span>
                          <span className="font-medium text-gray-800 w-16 text-right">${pc.cost.toFixed(4)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Run history */}
                <div className="rounded-xl border bg-white overflow-hidden" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
                  <div className="px-5 py-3 border-b text-xs font-medium text-gray-500 uppercase tracking-wider" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
                    Run history
                  </div>
                  <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'#F7F6F2'}}>
                        {['Status','Queries','GEO Score','Est. Cost','Date'].map(h => (
                          <th key={h} className="text-left px-4 py-2 font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {domainData.runs.map(r => (
                        <tr key={r.id}>
                          <td className="px-4 py-2" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-2 text-gray-700" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{r.completed_queries}/{r.total_queries}</td>
                          <td className="px-4 py-2 font-medium" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6',color:'#3C3489'}}>{r.geo_score ? Math.round(r.geo_score) : '—'}</td>
                          <td className="px-4 py-2 font-medium text-gray-800" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>${r.estimated_cost?.toFixed(4)}</td>
                          <td className="px-4 py-2 text-gray-400" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>{new Date(r.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── API HEALTH TAB ────────────────────────────────────── */}
        {tab === 'health' && health && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-white p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">API Key Status</div>
              <div className="space-y-3">
                {[
                  { key:'anthropic',  label:'Anthropic (Claude)',   platform:'claude',      required:true  },
                  { key:'openai',     label:'OpenAI (ChatGPT)',      platform:'chatgpt',     required:false },
                  { key:'google',     label:'Google (Gemini)',       platform:'gemini',      required:false },
                  { key:'perplexity', label:'Perplexity',           platform:'perplexity',  required:false },
                  { key:'serpapi',    label:'SerpAPI (AI Overview)', platform:'ai_overview', required:false },
                ].map(item => {
                  const h = health[item.key];
                  const meta = PLATFORM_META[item.platform] || {};
                  return (
                    <div key={item.key} className="flex items-center justify-between py-3 border-b" style={{borderBottomWidth:'0.5px',borderColor:'#f0ede6'}}>
                      <div className="flex items-center gap-3">
                        <HealthDot configured={h?.configured} />
                        <i className={`ti ${meta.icon} text-sm`} style={{color:meta.color}} />
                        <div>
                          <div className="text-sm font-medium text-gray-800">{item.label}</div>
                          <div className="text-[10px] text-gray-400">
                            {item.required ? 'Required — app breaks without this' : 'Optional — platform will show absent without this'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {h?.configured ? (
                          <span className="text-[10px] font-mono text-gray-400">···{h.key_hint}</span>
                        ) : null}
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: h?.configured ? '#E1F5EE' : item.required ? '#FEECEC' : '#F7F6F2',
                            color:      h?.configured ? '#0F6E56' : item.required ? '#B91C1C' : '#888780'
                          }}>
                          {h?.configured ? '✓ Configured' : item.required ? '✗ Missing — critical' : '— Not set'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick guide */}
            <div className="rounded-xl border p-5" style={{borderWidth:'0.5px',borderColor:'#e8e6df',background:'#F7F6F2'}}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Where to add missing keys</div>
              <div className="space-y-2 text-xs text-gray-600">
                {[
                  { label:'Anthropic',  url:'console.anthropic.com/settings/keys',    var:'ANTHROPIC_API_KEY'  },
                  { label:'OpenAI',     url:'platform.openai.com/api-keys',            var:'OPENAI_API_KEY'     },
                  { label:'Google',     url:'aistudio.google.com',                     var:'GOOGLE_AI_API_KEY'  },
                  { label:'Perplexity', url:'perplexity.ai/settings/api',              var:'PERPLEXITY_API_KEY' },
                  { label:'SerpAPI',    url:'serpapi.com/manage-api-key',              var:'SERPAPI_KEY'        },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="font-medium">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-gray-400">{item.var}</span>
                      <a href={`https://${item.url}`} target="_blank" rel="noreferrer"
                        className="text-blue-500 hover:underline">{item.url}</a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-400">Add all keys to Railway → backend service → Variables → Redeploy</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
