// OmniPom PWA main app (registers sw, uses IndexedDB, settings modal lazy load, optimized interactions)
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const defaults = { focus:25, short:5, long:15, longEvery:4, theme:'dark', showSeconds:true };
let state = { settings: {...defaults}, logs: [], pomCount:0, streak:0 };

const CLOCK = qs('#clock'), START = qs('#startBtn'), PAUSE = qs('#pauseBtn'), STOP = qs('#stopBtn');
const MODAL = qs('#modal'), MODAL_BODY = qs('#modal-body'), MODAL_CLOSE = qs('#modalClose');
const FILE_IN = qs('#fileInput');

let timer = { running:false, remaining: defaults.focus*60, mode:'focus', tick:null, startedAt:0 };

async function loadState(){ try{ const v = await idbGet('state'); if (v) state = Object.assign(state, v); }catch(e){ console.warn('idb load', e); } applySettings(); }
async function saveState(){ try{ await idbSet('state', state); }catch(e){ console.warn('idb save', e); } }

function applySettings(){ document.body.classList.toggle('theme-light', state.settings.theme==='light'); timer.mode = state.settings.lastMode || 'focus'; timer.remaining = (state.settings[timer.mode]||defaults[timer.mode])*60; renderClock(); renderBadges(); renderHistory(); lazyCharts(); }

function renderClock(){ const mm = Math.floor(timer.remaining/60), ss = timer.remaining%60; CLOCK.textContent = state.settings.showSeconds ? `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(mm).padStart(2,'0')}:00`; }

function renderBadges(){ const today = new Date().toISOString().slice(0,10); const todayMin = state.logs.filter(l=>l.mode==='focus' && l.start.slice(0,10)===today).reduce((a,b)=>a+b.minutes,0); qs('#todayBadge').textContent = `Today ${todayMin}m`; qs('#streakBadge').textContent = `Streak ${state.streak||0}`; }

function renderHistory(){ const h = qs('#history'); h.innerHTML=''; state.logs.slice(0,50).forEach(l=>{ const div=document.createElement('div'); div.className='item'; div.innerHTML = `<div><strong>${escapeHtml(l.mode)}</strong> ${l.minutes}m<br/><small>${new Date(l.start).toLocaleString()}</small></div><div><button class="btn small" data-id="${l.id}">Del</button></div>`; h.appendChild(div); }); }

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function startTimer(){ if (timer.running) return; timer.running=true; timer.startedAt=Date.now(); timer.tick=setInterval(()=>{ timer.remaining--; if (timer.remaining<=0) endTimer(); renderClock(); }, 1000); START.disabled=true; }
function pauseTimer(){ if (!timer.running) return; timer.running=false; clearInterval(timer.tick); START.disabled=false; }
function stopTimer(){ if (timer.running) pauseTimer(); timer.remaining=(state.settings[timer.mode]||defaults[timer.mode])*60; renderClock(); }

function endTimer(){ pauseTimer(); const elapsed = Math.round((Date.now()-timer.startedAt)/1000); const minutes = Math.max(1, Math.round(elapsed/60)); const entry = { id: crypto.randomUUID(), mode: timer.mode, minutes, start: new Date(timer.startedAt).toISOString(), end: new Date().toISOString(), tag: qs('#sessionTag').value, notes: qs('#sessionNotes').value || '' }; state.logs.unshift(entry); state.pomCount++; if (timer.mode==='focus'){ timer.mode = (state.pomCount % (state.settings.longEvery||4)===0) ? 'long' : 'short'; } else { timer.mode='focus'; } state.settings.lastMode=timer.mode; timer.remaining=(state.settings[timer.mode]||defaults[timer.mode])*60; saveState().then(()=>{ applySettings(); lazyCharts(); }); }

let chartsTimeout=null;
function lazyCharts(){ if (chartsTimeout) return; chartsTimeout=setTimeout(()=>{ drawLine(); drawPie(); chartsTimeout=null; }, 300); }
function drawLine(){ const c=qs('#lineChart'); const ctx=c.getContext('2d'); c.width=c.clientWidth; c.height=c.clientHeight; ctx.clearRect(0,0,c.width,c.height); const today=new Date(); const days=7; const data=[]; for(let i=days-1;i>=0;i--){ const d=new Date(today.getTime()-i*86400000); const k=d.toISOString().slice(0,10); const m=state.logs.filter(l=>l.mode==='focus' && l.start.slice(0,10)===k).reduce((a,b)=>a+b.minutes,0); data.push(m); } const max=Math.max(60,...data); ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=2; ctx.beginPath(); data.forEach((v,i)=>{ const x=20 + i*(c.width-40)/(data.length-1); const y=c.height-20 - (v/max)*(c.height-40); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); }
function drawPie(){ const c=qs('#pieChart'); const ctx=c.getContext('2d'); c.width=c.clientWidth; c.height=c.clientHeight; ctx.clearRect(0,0,c.width,c.height); const totals={}; state.logs.slice(0,200).forEach(l=>{ totals[l.mode]=(totals[l.mode]||0)+l.minutes; }); const keys=Object.keys(totals); const sum=keys.reduce((a,k)=>a+totals[k],0)||1; let angle=-Math.PI/2; keys.forEach((k,i)=>{ const v=totals[k]; const a=v/sum*2*Math.PI; ctx.fillStyle=`hsl(${i*90} 70% 55%)`; ctx.beginPath(); ctx.moveTo(c.width/2,c.height/2); ctx.arc(c.width/2,c.height/2,Math.min(c.width,c.height)/2-6,angle,angle+a); ctx.closePath(); ctx.fill(); angle+=a; }); }

// settings modal lazy render
let settingsRendered=false;
qs('#btn-settings').addEventListener('click', openSettings);
function openSettings(){ MODAL.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; if (!settingsRendered) renderSettings(); }
qs('#modalClose').addEventListener('click', closeModal);
MODAL.addEventListener('click',(e)=>{ if (e.target===MODAL) closeModal(); });
function closeModal(){ MODAL.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }

function renderSettings(){ const body=MODAL_BODY; body.innerHTML=''; const f=document.createElement('form'); f.className='settingsForm'; f.innerHTML = `
  <h2 id="modal-title">Settings</h2>
  <label>Focus (min) <input name="focus" type="number" value="${state.settings.focus||defaults.focus}"></label>
  <label>Short (min) <input name="short" type="number" value="${state.settings.short||defaults.short}"></label>
  <label>Long (min) <input name="long" type="number" value="${state.settings.long||defaults.long}"></label>
  <label>Long every N <input name="longEvery" type="number" value="${state.settings.longEvery||4}"></label>
  <label>Theme <select name="theme"><option value="dark" ${state.settings.theme==='dark'?'selected':''}>Dark</option><option value="light" ${state.settings.theme==='light'?'selected':''}>Light</option></select></label>
  <label><input type="checkbox" name="showSeconds" ${state.settings.showSeconds? 'checked':''}> Show seconds</label>
  <div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="resetDefaults">Reset</button></div>`;
  body.appendChild(f);
  f.addEventListener('submit',(e)=>{ e.preventDefault(); const fd=new FormData(f); state.settings.focus=Number(fd.get('focus')); state.settings.short=Number(fd.get('short')); state.settings.long=Number(fd.get('long')); state.settings.longEvery=Number(fd.get('longEvery')); state.settings.theme=fd.get('theme'); state.settings.showSeconds=!!fd.get('showSeconds'); saveState().then(()=>{ applySettings(); closeModal(); alert('Saved'); }); });
  qs('#resetDefaults').addEventListener('click', ()=>{ if(!confirm('Reset settings to defaults?')) return; state.settings={...defaults}; saveState().then(()=>{ applySettings(); renderSettings(); }); });
  settingsRendered=true;
}

// backup/import
qs('#btn-backup').addEventListener('click', async ()=>{ const data = JSON.stringify(state); if (window.showSaveFilePicker){ try{ const handle = await window.showSaveFilePicker({ suggestedName:'omnipom-backup.json', types:[{description:'JSON',accept:{'application/json':['.json']}}] }); const w = await handle.createWritable(); await w.write(data); await w.close(); alert('Saved'); return; }catch(e){ console.warn(e); } } const blob = new Blob([data], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='omnipom-backup.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); });
qs('#btn-import').addEventListener('click', ()=> FILE_IN.click());
FILE_IN.addEventListener('change', async (e)=>{ const f=e.target.files[0]; if(!f) return; const txt = await f.text(); try{ const obj = JSON.parse(txt); state = obj; await saveState(); applySettings(); alert('Imported'); }catch(err){ alert('Invalid file'); } });

// init
loadState().then(()=>{ lazyCharts(); });

// mode buttons and controls
qsa('.mode').forEach(b=>b.addEventListener('click', ()=>{ qsa('.mode').forEach(x=>x.setAttribute('aria-pressed','false')); const btn = event.currentTarget; btn.setAttribute('aria-pressed','true'); timer.mode = btn.dataset.mode; state.settings.lastMode = timer.mode; timer.remaining = (state.settings[timer.mode]||defaults[timer.mode])*60; renderClock(); saveState(); }));
START.addEventListener('click', startTimer); PAUSE.addEventListener('click', pauseTimer); STOP.addEventListener('click', stopTimer);
qs('#history').addEventListener('click',(e)=>{ const id = e.target.dataset.id; if(!id) return; state.logs = state.logs.filter(l=>l.id!==id); saveState().then(()=>{ renderHistory(); lazyCharts(); }); });
window.addEventListener('keydown',(e)=>{ if (e.code==='Space'){ e.preventDefault(); if (timer.running) pauseTimer(); else startTimer(); } });
