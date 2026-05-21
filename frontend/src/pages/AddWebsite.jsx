// src/pages/AddWebsite.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { projects as projectsApi } from '../lib/api.js';

const PROG_STEPS = [
  { id: 'pf1', label: 'Crawling pages',      icon: 'ti-world' },
  { id: 'pf2', label: 'Extracting niche',    icon: 'ti-brain' },
  { id: 'pf3', label: 'Detecting services',  icon: 'ti-building-store' },
  { id: 'pf4', label: 'Finding competitors', icon: 'ti-users' },
  { id: 'pf5', label: 'Generating prompts',  icon: 'ti-messages' },
];

const CAT_STYLES = {
  1: { bg: '#EEEDFE', color: '#3C3489', label: 'Niche discovery' },
  2: { bg: '#E1F5EE', color: '#0F6E56', label: 'Brand info' },
  3: { bg: '#FAEEDA', color: '#854F0B', label: 'General niche' },
  4: { bg: '#FAECE7', color: '#712B13', label: 'Info hybrid' },
};

// ─── Platform definitions ─────────────────────────────────────────
const ALL_PLATFORMS = [
  { id: 'chatgpt',     label: 'ChatGPT',     icon: 'ti-brand-openai', color: '#378ADD', desc: 'GPT-4o-mini' },
  { id: 'perplexity',  label: 'Perplexity',  icon: 'ti-search',       color: '#1D9E75', desc: 'Sonar model' },
  { id: 'gemini',      label: 'Gemini',      icon: 'ti-brand-google', color: '#EF9F27', desc: '1.5 Flash' },
  { id: 'claude',      label: 'Claude',      icon: 'ti-robot',        color: '#D85A30', desc: 'Haiku model' },
  { id: 'ai_overview', label: 'AI Overview', icon: 'ti-layout-list',  color: '#888780', desc: 'Google SERP' },
];

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

  // ─── Platform selection state ───────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    ALL_PLATFORMS.map(p => p.id) // all selected by default
  );

  // ─── Prompt preview state ───────────────────────────────────────
  const [editingIdx, setEditingIdx] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [newPromptCat, setNewPromptCat] = useState(1);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [filterCat, setFilterCat] = useState(0);

  // ─── Platform toggle ────────────────────────────────────────────
  function togglePlatform(id) {
    setSelectedPlatforms(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          toast.error('Select at least one platform');
          return prev;
        }
        return prev.filter(p => p !== id);
      }
      return [...prev, id];
    });
  }

  function addKeywords() {
    const lines = kwInput.split('\n').map(l => l.trim()).filter(Boolean);
    setManualKws(prev => [...new Set([...prev, ...lines])]);
    setKwInput('');
  }

  function removeKw(kw) {
    setManualKws(prev => prev.filter(k => k !== kw));
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditingText(autoPrompts[idx].text);
  }

  function saveEdit(idx) {
    if (!editingText.trim()) return toast.error('Prompt cannot be empty');
    setAutoPrompts(prev => prev.map((p, i) => i === idx ? { ...p, text: editingText.trim() } : p));
    setEditingIdx(null);
    setEditingText('');
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditingText('');
  }

  function deletePrompt(idx) {
    setAutoPrompts(prev => prev.filter((_, i) => i !== idx));
    toast.success('Prompt removed');
  }

  function addNewPrompt() {
    if (!newPromptText.trim()) return toast.error('Enter a prompt first');
    setAutoPrompts(prev => [...prev, { text: newPromptText.trim(), category: newPromptCat, source: 'auto' }]);
    setNewPromptText('');
    setShowAddPrompt(false);
    toast.success('Prompt added');
  }

  function movePrompt(idx, dir) {
    const next = idx + dir;
    if (next < 0 || next >= autoPrompts.length) return;
    setAutoPrompts(prev => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function fallbackScan() {
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
    } catch {
      clearInterval(stepTimer);
      toast.error('Scan failed — please check the URL and try again');
      setScanning(false);
      setProgSteps(Array(5).fill(0));
    }
  }

  async function doScan() {
    if (!url.trim()) return toast.error('Enter a URL first');
    setScanning(true);
    setProgSteps(Array(5).fill(0));
    setScanned(false);
    setAnalysis(null);
    setAutoPrompts([]);
    setEditingIdx(null);
    setFilterCat(0);
    await fallbackScan();
  }

  async function launch() {
    if (!analysis) return;
    if (autoPrompts.length === 0 && manualKws.length === 0) {
      return toast.error('Add at least one prompt before launching');
    }
    if (selectedPlatforms.length === 0) {
      return toast.error('Select at least one platform');
    }
    setLaunching(true);
    try {
      const { data } = await projectsApi.create({
        url,
        analysis,
        prompts: autoPrompts,
        manualKeywords: manualKws,
        checkFrequency: 'weekly',
        selectedPlatforms, // ← sent to backend
      });
      toast.success('Checks launched!');
      nav(`/checking/${data.checkRunId}?projectId=${data.project.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to launch');
      setLaunching(false);
    }
  }

  const filteredPrompts = filterCat === 0
    ? autoPrompts
    : autoPrompts.filter(p => p.category === filterCat);

  const totalPrompts = autoPrompts.length + manualKws.length;

  // Estimated query count
  const estimatedQueries = totalPrompts * selectedPlatforms.length * 3;

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
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${i===0?'text-white':'border text-gray-400'}`}
                  style={i===0?{background:'#7F77DD'}:{borderWidth:'0.5px',borderColor:'#d1d0c8'}}>
                  {i+1}
                </div>
                <span className={`text-xs font-medium ${i===0?'text-gray-900':'text-gray-400'}`}>{label}</span>
              </div>
              {i < 2 && <div className="flex-1 h-px mx-3" style={{background:'#e0dfd7'}} />}
            </div>
          ))}
        </div>

        {/* Main card */}
        <div className="card">
          <h1 className="text-base font-medium text-gray-900 mb-1">Add your website</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your URL — we'll auto-scan and generate 16 tracking prompts. Choose platforms and review prompts before launching.</p>

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
                    <i className={`ti ${step.icon} text-xs`} />{step.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{width:`${progSteps[i]}%`, background:'#7F77DD'}} />
                  </div>
                  <span className={`text-xs w-14 text-right flex-shrink-0 ${progSteps[i]===100?'text-teal-400':'text-gray-400'}`}>
                    {progSteps[i]===100 ? (i===4?`${autoPrompts.length} ready`:'Done') : '...'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Analysis summary */}
          {scanned && analysis && (
            <div className="mb-5 rounded-lg p-4 space-y-2" style={{background:'#F7F6F2'}}>
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
            </div>
          )}

          {/* ── PLATFORM SELECTION ──────────────────────────────── */}
          <div className="border-t mb-5" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}} />

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="section-label" style={{marginBottom:0}}>AI Platforms to check</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background:'#EEEDFE',color:'#3C3489'}}>
                {selectedPlatforms.length} / {ALL_PLATFORMS.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelectedPlatforms(ALL_PLATFORMS.map(p => p.id))}
                className="text-[11px] text-gray-400 hover:text-gray-700">Select all</button>
              <span className="text-gray-200">·</span>
              <button onClick={() => setSelectedPlatforms([ALL_PLATFORMS[0].id])}
                className="text-[11px] text-gray-400 hover:text-gray-700">Clear</button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            {ALL_PLATFORMS.map(platform => {
              const isSelected = selectedPlatforms.includes(platform.id);
              return (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all"
                  style={{
                    borderWidth: '1.5px',
                    borderColor: isSelected ? platform.color : '#e8e6df',
                    background:  isSelected ? `${platform.color}12` : '#fff',
                    cursor: 'pointer',
                  }}>
                  {/* Checkmark */}
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: isSelected ? platform.color : '#f1efe8',
                    }}>
                    <i className="ti ti-check text-[9px] text-white" style={{opacity: isSelected ? 1 : 0}} />
                  </div>

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{background: isSelected ? `${platform.color}20` : '#f7f6f2'}}>
                    <i className={`ti ${platform.icon} text-base`}
                      style={{color: isSelected ? platform.color : '#b4b2a9'}} />
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <div className="text-[11px] font-medium leading-tight"
                      style={{color: isSelected ? '#1a1a1a' : '#888780'}}>
                      {platform.label}
                    </div>
                    <div className="text-[9px] leading-tight mt-0.5"
                      style={{color: isSelected ? '#888780' : '#c4c2ba'}}>
                      {platform.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Query estimate */}
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
            <i className="ti ti-info-circle text-xs" />
            <span>
              {totalPrompts} prompts × {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''} × 3 runs
              = <span className="font-medium text-gray-600">{estimatedQueries} total queries</span>
            </span>
          </div>

          {/* ── PROMPT PREVIEW ──────────────────────────────────── */}
          {scanned && autoPrompts.length > 0 && (
            <>
              <div className="border-t mb-5 mt-4" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}} />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="section-label" style={{marginBottom:0}}>Auto-generated prompts</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background:'#EEEDFE',color:'#3C3489'}}>
                    {autoPrompts.length}
                  </span>
                </div>
                <span className="text-xs text-gray-400">Edit · delete · reorder</span>
              </div>

              {/* Category filter */}
              <div className="flex gap-1.5 mb-3 flex-wrap">
                <button onClick={() => setFilterCat(0)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                  style={{borderWidth:'0.5px',background:filterCat===0?'#7F77DD':'transparent',color:filterCat===0?'#fff':'#888780',borderColor:filterCat===0?'#7F77DD':'#d1d0c8'}}>
                  All ({autoPrompts.length})
                </button>
                {[1,2,3,4].map(cat => {
                  const count = autoPrompts.filter(p => p.category === cat).length;
                  if (!count) return null;
                  const s = CAT_STYLES[cat];
                  return (
                    <button key={cat} onClick={() => setFilterCat(filterCat===cat ? 0 : cat)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                      style={{borderWidth:'0.5px',background:filterCat===cat?s.bg:'transparent',color:filterCat===cat?s.color:'#888780',borderColor:filterCat===cat?s.color:'#d1d0c8'}}>
                      {s.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Prompt list */}
              <div className="space-y-1.5 mb-3">
                {filteredPrompts.map(prompt => {
                  const realIdx   = autoPrompts.indexOf(prompt);
                  const catStyle  = CAT_STYLES[prompt.category] || {};
                  const isEditing = editingIdx === realIdx;

                  return (
                    <div key={realIdx} className="rounded-lg border transition-all"
                      style={{borderWidth:'0.5px',borderColor:isEditing?'#7F77DD':'#e8e6df',background:isEditing?'#faf9ff':'#fff'}}>
                      {isEditing ? (
                        <div className="p-2.5">
                          <input value={editingText} onChange={e => setEditingText(e.target.value)}
                            onKeyDown={e => { if(e.key==='Enter') saveEdit(realIdx); if(e.key==='Escape') cancelEdit(); }}
                            autoFocus className="w-full text-xs text-gray-800 bg-transparent outline-none" style={{fontFamily:'inherit'}} />
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={() => saveEdit(realIdx)}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-white" style={{background:'#7F77DD'}}>Save</button>
                            <button onClick={cancelEdit}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-gray-500 border" style={{borderWidth:'0.5px',borderColor:'#d1d0c8'}}>Cancel</button>
                            <span className="text-[10px] text-gray-400">Enter to save · Esc to cancel</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2">
                          {prompt.category && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{background:catStyle.bg,color:catStyle.color}}>C{prompt.category}</span>
                          )}
                          <span className="flex-1 text-xs text-gray-700 leading-relaxed">{prompt.text}</span>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => movePrompt(realIdx,-1)} disabled={realIdx===0}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-gray-600 disabled:opacity-20">
                              <i className="ti ti-chevron-up text-xs" /></button>
                            <button onClick={() => movePrompt(realIdx,1)} disabled={realIdx===autoPrompts.length-1}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-gray-600 disabled:opacity-20">
                              <i className="ti ti-chevron-down text-xs" /></button>
                            <button onClick={() => startEdit(realIdx)}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-blue-500">
                              <i className="ti ti-pencil text-xs" /></button>
                            <button onClick={() => deletePrompt(realIdx)}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-400">
                              <i className="ti ti-trash text-xs" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add prompt */}
              {showAddPrompt ? (
                <div className="rounded-lg border p-3 mb-3" style={{borderWidth:'0.5px',borderColor:'#7F77DD',background:'#faf9ff'}}>
                  <div className="text-xs font-medium text-gray-700 mb-2">Add a prompt</div>
                  <input value={newPromptText} onChange={e => setNewPromptText(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter') addNewPrompt(); if(e.key==='Escape') setShowAddPrompt(false); }}
                    placeholder="e.g. best digital marketing agency for startups" autoFocus className="w-full text-xs mb-2" />
                  <div className="flex items-center gap-2">
                    <select value={newPromptCat} onChange={e => setNewPromptCat(Number(e.target.value))}
                      className="text-xs rounded border px-2 py-1"
                      style={{borderWidth:'0.5px',borderColor:'#d1d0c8',background:'white',color:'#444'}}>
                      {[1,2,3,4].map(c => <option key={c} value={c}>Cat {c} — {CAT_STYLES[c].label}</option>)}
                    </select>
                    <button onClick={addNewPrompt}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-md text-white" style={{background:'#7F77DD'}}>Add</button>
                    <button onClick={() => setShowAddPrompt(false)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-md text-gray-500 border" style={{borderWidth:'0.5px',borderColor:'#d1d0c8'}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddPrompt(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-1 py-1">
                  <i className="ti ti-plus text-xs" />Add a prompt
                </button>
              )}
            </>
          )}

          {/* Divider */}
          <div className="border-t mb-5 mt-2" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}} />

          {/* Manual keywords */}
          <div className="flex items-center justify-between mb-2">
            <span className="section-label" style={{marginBottom:0}}>Manual keywords / prompts</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{manualKws.length} added</span>
          </div>
          <p className="text-xs text-gray-400 mb-3 leading-relaxed">
            Add extra prompts — competitor comparisons, niche queries, branded questions. One per line.
          </p>
          <textarea value={kwInput} onChange={e => setKwInput(e.target.value)} rows={3}
            placeholder={"best yoga app for weight loss\nYogaFlow vs Peloton\nonline yoga certification india"}
            className="mb-2 font-mono text-xs" />
          <button className="btn-ghost text-xs flex items-center gap-1.5 mb-3" onClick={addKeywords}>
            <i className="ti ti-plus text-xs" />Add prompts
          </button>

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
            <span>
              Each prompt runs across your selected {selectedPlatforms.length} platform{selectedPlatforms.length!==1?'s':''} × 3 runs.
              Total: <span className="font-medium text-gray-700">{estimatedQueries} API calls</span>.
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t" style={{borderTopWidth:'0.5px',borderColor:'#e8e6df'}}>
            <div className="text-xs text-gray-400">
              {scanned
                ? <span>{totalPrompts} prompts · {selectedPlatforms.length} platforms · {estimatedQueries} queries</span>
                : 'Enter URL and scan first'}
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={launch}
              disabled={!scanned || launching || totalPrompts===0 || selectedPlatforms.length===0}>
              {launching
                ? <><i className="ti ti-loader-2 animate-spin text-sm" />Launching...</>
                : <><i className="ti ti-rocket text-sm" />Launch {estimatedQueries ? `${estimatedQueries} checks` : ''}<i className="ti ti-arrow-right text-sm" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
