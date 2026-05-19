// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projects as projectsApi } from '../lib/api.js';
import { useStore } from '../lib/store.js';
import toast from 'react-hot-toast';

const TIER_COLOR = {
  high:   { bg:'#E1F5EE', color:'#0F6E56', label:'Strong' },
  mid:    { bg:'#FAEEDA', color:'#854F0B', label:'Growing' },
  low:    { bg:'#FCEBEB', color:'#A32D2D', label:'Weak'   },
  none:   { bg:'#F1EFE8', color:'#5F5E5A', label:'New'    },
};

function scoreToTier(score) {
  if (!score) return 'none';
  if (score >= 65) return 'high';
  if (score >= 35) return 'mid';
  return 'low';
}

export default function Dashboard() {
  const [projectList, setProjectList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useStore();
  const nav = useNavigate();

  useEffect(() => {
    projectsApi.list()
      .then(r => setProjectList(r.data))
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      {/* Nav */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between" style={{borderBottomWidth:'0.5px',borderColor:'#e8e6df'}}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{background:'#7F77DD'}}>AI</div>
          <span className="text-sm font-medium text-gray-800">AI Visibility</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{user?.email}</span>
          <button className="btn-ghost text-xs" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Your projects</h1>
            <p className="text-sm text-gray-400 mt-0.5">{projectList.length} website{projectList.length !== 1 ? 's' : ''} tracked</p>
          </div>
          <Link to="/add" className="btn-primary flex items-center gap-2 text-sm">
            <i className="ti ti-plus text-sm" />Add website
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            <i className="ti ti-loader-2 animate-spin mr-2" />Loading...
          </div>
        ) : projectList.length === 0 ? (
          <div className="card text-center py-16">
            <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center" style={{background:'#EEEDFE'}}>
              <i className="ti ti-world text-xl" style={{color:'#7F77DD'}} />
            </div>
            <h2 className="text-sm font-medium text-gray-800 mb-1">No websites yet</h2>
            <p className="text-xs text-gray-400 mb-5">Add your first website to start tracking AI visibility.</p>
            <Link to="/add" className="btn-primary inline-flex items-center gap-2 text-sm">
              <i className="ti ti-plus text-sm" />Add your first website
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projectList.map(proj => {
              const tier = scoreToTier(proj.geo_score);
              const tc = TIER_COLOR[tier];
              const initials = (proj.brand_name || proj.domain).slice(0, 2).toUpperCase();
              return (
                <div key={proj.id} className="card flex items-center gap-4 hover:border-brand-200 transition-colors cursor-pointer"
                  onClick={() => nav(`/report/${proj.id}`)}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0" style={{background:'#EEEDFE',color:'#3C3489'}}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{proj.brand_name || proj.domain}</div>
                    <div className="text-xs text-gray-400 truncate">{proj.domain} · {proj.niche || 'Website'}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {proj.geo_score ? (
                      <div className="text-center">
                        <div className="text-lg font-medium" style={{color:'#3C3489'}}>{Math.round(proj.geo_score)}</div>
                        <div className="text-[10px] text-gray-400">GEO score</div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-xs text-gray-300">—</div>
                        <div className="text-[10px] text-gray-300">No data</div>
                      </div>
                    )}
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{background:tc.bg,color:tc.color}}>{tc.label}</span>
                    <div className="text-xs text-gray-400">
                      {proj.last_run_at ? new Date(proj.last_run_at).toLocaleDateString() : 'Never checked'}
                    </div>
                    <i className="ti ti-chevron-right text-gray-300 text-sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
