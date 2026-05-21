// src/pages/AddWebsite.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { projects as projectsApi } from '../lib/api.js';

const PROG_STEPS = [
  { id: 'pf1', label: 'Crawling pages',       icon: 'ti-world' },
  { id: 'pf2', label: 'Extracting niche',     icon: 'ti-brain' },
  { id: 'pf3', label: 'Detecting services',   icon: 'ti-building-store' },
  { id: 'pf4', label: 'Finding competitors',  icon: 'ti-users' },
  { id: 'pf5', label: 'Generating prompts',   icon: 'ti-messages' },
];

// Base API URL — works in both dev (Vite proxy) and production (Vercel → Railway)
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function AddWebsite() {
  const nav = useNavigate();
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progSteps, setProgSteps] = useState(Array(5).fill(0));
  const [analysis, setAnalysis] = useState(null);
  const [autoPrompts, setAutoPrompts] = useState([]);
  const [kwInput, setKwInput] = useState('');
  const [manualKws, setManualKws] = useState([]);
  const [launching, setLaunching] = useState(false);
  const evtRef = useRef(null);

  function addKeywords() {
    const lines = kwInput.split('\n').map(l => l.trim()).filter(Boolean);
    setManualKws(prev => [...new Set([...prev, ...lines])]);
    setKwInput('');
  }

  function removeKw(kw) {
    setManualKws(prev => prev.filter(k => k !== kw));
  }

  async function doScan() {
    if (!url.trim()) return toast.error('Enter a URL first');
    setScanning(true);
    setProgSteps(Array(5).fill(0));
    setScanned(false);
    setAnalysis(null);
    setAutoPrompts([]);

    // Always use fallbackScan — EventSource can't send auth headers in browser
    // The /scan SSE route requires auth, so we use scan-simple (GET + auth header)
    await fallbackScan();
  }

  async function fallbackScan() {
    // Animate progress steps while API runs
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx >= 5) { clearInterval(stepTimer); return; }
      setProgSteps(prev => prev.map((v, i) => i === stepIdx ? 100 : v));
      stepIdx++;
    }, 900);

    try {
      const res = await fetch(
        `${API_BASE}/api/projects/scan-simple?url=${encodeURIComponent(url)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      clearInterval(stepTimer);
      setProgSteps(Array(5).fill(100));

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis);
        setAutoPrompts(data.prompts || []);
        setScanned(true);
        setScanning(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Scan failed — please try again');
        setScanning(false);
        setProgSteps(Array(5).fill(0));
      }

    } catch (err) {
      clearInterval(stepTimer);
      toast.error('Scan failed — please check the URL and try again');
      setScanning(false);
      setProgSteps(Array(5).fill(0));
    }
  }

  async function launch() {
    if (!analysis) return;
    setLaunching(true);
    try {
      const { data } = await projectsApi.create({
        url, analysis, prompts: autoPrompts,
        manualKeywords: manualKws, checkFrequency: 'weekly'
      });
      toast.success('Checks launched!');
      nav(`/checking/${data.checkRunId}?projectId=${data.project.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to launch');
      setLaunching(false);
    }
  }

  const catColors = ['','bg-brand-50 text-brand-800','bg-teal-50 text-teal-600','bg-amber-50 text-[#854F0B]','bg-[#FAECE7] text-[#712B13]'];
  const catLabels = ['','Niche & services','Brand informational','General niche','Info + niche hybrid'];

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
          {['Add website','Running checks','Report'].map((label, i) => (
            <div key={i} className="flex items-center" style={{flex: i < 2 ? '1' : 'none'}}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${i===0 ? 'text-white' : 'border text-gray-400'}`}
                  style={i===0 ? {background:'#7F77DD'} : {borderWidth:'0.5px',borderColor:'#d1d0c8'}}>
                  {i+1}
                </div>
                <span className={`text-xs font-medium ${i===0 ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px mx-3" style={{background:'#e0dfd7'}} />}
            </div>
          ))}
        </div>

        {/* Main card */}
        <div className="card">
          <h1 className="text-base font-medium text-gray-900 mb-1">Add your website</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your URL — we'll auto-scan and generate 16 tracking prompts across 4 categories. Add your own keywords too.</p>

          {/* URL input */}
          <div className="section-label">Website URL</div>
          <div className="flex gap-2 mb-6">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              onKeyDown={e => e.key === 'Enter' && !scanning && !scanned && doScan()}
              disabled={scanning || scanned}
            />
            <button className="btn-primary flex-shrink-0 flex items-center gap-2" onClick={doScan}
              disabled={scanning || scanned || !url.trim()}>
              {scanning
                ? <><i className="ti ti-loader-2 animate-spin text-sm" /><span>Scanning...</span></>
                : scanned
                ? <><i className="ti ti-check text-sm" /><span>Scanned</span></>
                : <><i className="ti ti-scan text-sm" /><span>Scan & generate</span></>}
            </button>
          </div>

          {/* Scan progress */}
          {(scanning || scanned) && (
            <div className="mb-6 space-y-2">
              {PROG_STEPS.map((step, i) => (
                <div key={step.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-44 flex items-center gap-1.5 flex-shrink-0">
                    <i className={`ti ${step.icon} text-xs`} />
                    {step.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{width:`${progSteps[i]}%`,background:'#7F77DD'}} />
                  </div>
                  <span className={`text-xs w-12 text-right flex-shrink-0 ${progSteps[i]===100?'text-teal-400':'text-gray-400'}`}>
                    {progSteps[i]===100 ? (i===4?'16 ready':'Done') : '...'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Analysis result */}
          {scanned && analysis && (
            <div className="mb-6 rounded-lg p-4 space-y-2" style={{background:'#F7F6F2'}}>
              <div className="flex justify-between text-xs"><span className="text-gray-400">Brand</span><span className="font-medium text-gray-800">{analysis.brand_name}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-400">Niche</span><span className="font-medium text-gray-800">{analysis.niche}</span></div>
              <div className="flex justify-between text-xs items-start gap-4">
                <span className="text-gray-400 flex-shrink-0">Services</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(Array.isArray(analysis.services) ? analysis.services : []).slice(0,5).map(s => (
                    <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{background:'#EEEDFE',color:'#3C3489'}}>{s}</span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-xs items-start gap-4">
                <span className="text-gray-400 flex-shrink-0">Competitors</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(Array.isArray(analysis.competitors) ? analysis.competitors : []).slice(0,4).map(c => (
                    <span key={c} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c}</span>
                  ))}
                </div>
              </div>
              <div className="pt-1 text-xs text-gray-500 flex items-center gap-1.5">
                <i className="ti ti-check text-teal-400" />
                <span className="text-teal-600 font-medium">{autoPrompts.length} prompts</span> auto-generated across 4 categories
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t mb-6" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}} />

          {/* Manual keywords */}
          <div className="flex items-center justify-between mb-2">
            <span className="section-label" style={{marginBottom:0}}>Manual keywords / prompts</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{manualKws.length} added</span>
          </div>
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">
            Add specific prompts to track — competitor comparisons, niche queries, branded questions. One per line. These run alongside AI-generated ones.
          </p>
          <textarea
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            rows={3}
            placeholder={"best yoga app for weight loss\nYogaFlow vs Peloton\nonline yoga certification india"}
            className="mb-2 font-mono text-xs"
          />
          <button className="btn-ghost text-xs flex items-center gap-1.5 mb-3" onClick={addKeywords}>
            <i className="ti ti-plus text-xs" />Add prompts
          </button>

          {/* Manual tags */}
          {manualKws.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {manualKws.map(kw => (
                <span key={kw} className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full" style={{background:'#E1F5EE',color:'#0F6E56'}}>
                  <i className="ti ti-pencil text-[10px]" />{kw}
                  <i className="ti ti-x text-[10px] cursor-pointer ml-0.5" onClick={() => removeKw(kw)} />
                </span>
              ))}
            </div>
          )}

          {/* Info bar */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg text-xs text-gray-500" style={{background:'#F7F6F2'}}>
            <i className="ti ti-info-circle text-gray-400 mt-0.5 flex-shrink-0" />
            <span>Manual prompts get the same 5-platform × 3-run consistency check as auto-generated ones and appear labelled <span className="font-medium px-1.5 py-0.5 rounded text-[10px]" style={{background:'#EEEDFE',color:'#3C3489'}}>manual</span> in your report.</span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}}>
            <span className="text-xs text-gray-400">
              {scanned ? `${autoPrompts.length + manualKws.length} prompts ready to check` : 'Enter URL and scan first'}
            </span>
            <button className="btn-primary flex items-center gap-2" onClick={launch}
              disabled={!scanned || launching}>
              {launching
                ? <><i className="ti ti-loader-2 animate-spin text-sm" />Launching...</>
                : <><i className="ti ti-rocket text-sm" />Launch {autoPrompts.length + manualKws.length || ''} checks<i className="ti ti-arrow-right text-sm" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
