/* NEET Companion - app.js
   Full-featured client-side app: Pomodoro engine, analytics, feed loader, todos, formulas, persistence, charts.
   No external APIs required. Designed for PWA installation.
*/
(function(){
  'use strict';
  // helpers
  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));
  const pad = n=>String(n).padStart(2,'0');
  const uid = ()=>Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const todayKey = ()=> new Date().toISOString().slice(0,10);

  // elements
  const timeDisplay = $('#timeDisplay'), phaseLabel = $('#phaseLabel'), startBtn = $('#start'), pauseBtn = $('#pause'), skipBtn = $('#skip'), lapBtn = $('#lap'), panicBtn = $('#panic');
  const bar = document.getElementById('bar');
  const todayFill = $('#todayFill'), todayTxt = $('#todayTxt'), cycleFill = $('#cycleFill'), cycleTxt = $('#cycleTxt');
  const feedList = $('#feedList'), feedUrl = $('#feedUrl'), btnLoadFeed = $('#btnLoadFeed'), btnSaveFeed = $('#btnSaveFeed');
  const todoInput = $('#todoInput'), todosDiv = $('#todos');
  const formulaList = $('#formulaList'), btnAddFormula = $('#btnAddFormula');
  const chartDaily = $('#chartDaily'), chartPhases = $('#chartPhases');
  const exportBtn = $('#exportBtn'), btnResetStats = $('#btnResetStats');
  const clockNow = $('#clockNow');

  // constants for ring
  const R = 52, CIRC = 2*Math.PI*R;

  // default state
  const DEFAULT = {
    settings: {
      focus:25, short:5, long:15, perLong:4, cycles:4, autoStart:false, countMode:'down', precision:1000, dailyGoal:240, accentHue:220, sound:true, tick:false
    },
    stats: { day: todayKey(), focusToday:0, pomos:0, cyclesDone:0, laps:[], history: [] , phaseTotals: {focus:0, short:0, long:0}},
    todos: [], formulas: [], feeds: [], preferences: {theme:'neon'}
  };

  // storage
  const KEY = 'neet_final_v1';
  let state = JSON.parse(localStorage.getItem(KEY) || 'null') || DEFAULT;
  // ensure new fields present
  state.settings = Object.assign({}, DEFAULT.settings, state.settings || {});
  state.stats = Object.assign({}, DEFAULT.stats, state.stats || {});
  state.todos = state.todos || [];
  state.formulas = state.formulas || [];
  state.feeds = state.feeds || [];
  state.preferences = Object.assign({}, DEFAULT.preferences, state.preferences || {});

  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }

  // timer variables
  let running=false, phase='focus', remaining = state.settings.focus*60, elapsed=0, pomoCount=0, cycle=1, lastTick=performance.now(), raf=0;

  function phaseDuration(){ return phase==='focus' ? state.settings.focus*60 : (phase==='short'? state.settings.short*60 : state.settings.long*60); }
  function setRingPct(pct){ const off = Math.max(0, CIRC * (1 - pct)); bar.style.strokeDashoffset = off; }

  function render(){
    const total = phaseDuration();
    const sec = Math.max(0, Math.round(state.settings.countMode==='up'? elapsed : remaining || total));
    timeDisplay.textContent = `${pad(Math.floor(sec/60))}:${pad(sec%60)}`;
    phaseLabel.textContent = phase==='focus' ? 'Focus' : (phase==='short'? 'Short Break' : 'Long Break');
    const pct = total? Math.min(1, (total - remaining)/total) : 0;
    setRingPct(isNaN(pct)?0:pct);
    // stats UI
    todayFill.style.width = `${Math.min(100, Math.round(state.stats.focusToday / state.settings.dailyGoal * 100))}%`;
    todayTxt.textContent = `${state.stats.focusToday} / ${state.settings.dailyGoal} min`;
    cycleFill.style.width = `${Math.min(100, Math.round((cycle-1)/state.settings.cycles*100))}%`;
    cycleTxt.textContent = `${cycle} / ${state.settings.cycles}`;
    // session info
    $('#sessionInfo').textContent = `Pomodoro • ${state.settings.focus}/${state.settings.short} • Cycle ${cycle}/${state.settings.cycles}`;
    $('#feedCount').textContent = (state.feeds||[]).length;
    clockNow.textContent = new Date().toLocaleTimeString();
  }

  // timer engine
  function start(){
    if(running) return;
    running=true; startBtn.textContent='Running'; lastTick=performance.now(); tick();
  }
  function pause(){ running=false; startBtn.textContent='Start'; cancelAnimationFrame(raf); }
  function resetTimer(){ running=false; elapsed=0; remaining=phaseDuration(); render(); cancelAnimationFrame(raf); }
  function tick(){
    if(!running) return;
    const now = performance.now();
    const delta = (now - lastTick)/1000; lastTick = now;
    remaining -= delta; elapsed += delta;
    if(remaining <= 0){ finishPhase(); return; }
    render();
    raf = requestAnimationFrame(tick);
  }
  function finishPhase(){
    running=false; cancelAnimationFrame(raf);
    // notifications & sound
    try{ if(state.settings.sound) playTone(); if(navigator.vibrate) navigator.vibrate([120,40,120]); }catch(e){}
    // stats update
    const durMin = Math.round(phaseDuration()/60);
    state.stats.phaseTotals[phase] = (state.stats.phaseTotals[phase]||0) + durMin;
    if(phase==='focus'){
      state.stats.focusToday += durMin;
      state.stats.pomos += 1; pomoCount +=1;
      if(pomoCount % state.settings.perLong === 0) phase = 'long'; else phase = 'short';
    }else{
      if(phase==='long'){ state.stats.cyclesDone +=1; cycle = Math.min(state.settings.cycles, cycle+1); }
      phase = 'focus';
    }
    elapsed = 0; remaining = phaseDuration();
    // persist history daily
    rolloverDay();
    save(); render(); refreshCharts();
    if(state.settings.autoStart) start();
  }

  function skip(){
    if(phase==='focus') phase = (pomoCount % state.settings.perLong === 0)? 'long':'short'; else phase='focus';
    elapsed=0; remaining=phaseDuration(); render();
    if(state.settings.autoStart) start();
  }

  function addLap(){
    const t = new Date().toLocaleString();
    state.stats.laps.push({id:uid(), time:t, phase, display: timeDisplay.textContent});
    save(); alert('Lap saved: '+t);
  }

  function panic(){
    if(confirm('Reset all app data? This will clear local storage.')){
      localStorage.removeItem(KEY); location.reload();
    }
  }

  // tone
  function playTone(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type='sine'; o.frequency.value = 880; g.gain.value = 0.12;
      o.connect(g); g.connect(ctx.destination); o.start(); setTimeout(()=>{ o.stop(); try{ ctx.close(); }catch(e){} }, 220);
    }catch(e){}
  }

  // FEEDS: support static embedded items + fetch of JSON/RSS
  const EMBEDDED_FEEDS = [
    {title:'NEET Syllabus Reminder', source:'NEET Companion', time:'', summary:'Make sure you revise Class 11 & 12 Physics, Chemistry, Biology. Focus on modules with high weightage.'},
    {title:'Quick Tip: Biology MCQs', source:'NEET Tips', time:'', summary:'Practice diagrams and plant anatomy; prioritize NCERT diagrams.'},
    {title:'Exam Date Poll', source:'NEET Poll', time:'', summary:'Share your target exam month in app’s poll feature (offline storage). Use Tools → Polls.'}
  ];

  function renderFeeds(items){
    feedList.innerHTML='';
    const arr = items.slice(0,30);
    arr.forEach(it=>{
      const tpl = document.getElementById('feedTpl');
      const node = tpl.content.cloneNode(true);
      node.querySelector('.feed-title').textContent = it.title || 'Untitled';
      node.querySelector('.feed-meta').textContent = it.source + (it.time? ' • '+it.time : '');
      node.querySelector('.feed-body').textContent = it.summary || '';
      feedList.appendChild(node);
    });
  }

  async function fetchFeed(url){
    try{
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if(ct.includes('application/json')){
        const j = await res.json();
        const items = j.items || j.articles || (Array.isArray(j)? j : []);
        const out = items.map(it=>({title: it.title || it.headline, summary: it.description || it.summary || it.content || '', source:url, time: it.pubDate||it.publishedAt||''}));
        renderFeeds(out);
      }else{
        const txt = await res.text();
        // parse RSS <item> tags (crude)
        const re = /<item[\s\S]*?<\/item>/gi;
        const matches = txt.match(re) || [];
        const items = matches.map(itm=>{
          const t = (itm.match(/<title>([\s\S]*?)<\/title>/i)||[])[1] || '';
          const d = (itm.match(/<description>([\s\S]*?)<\/description>/i)||[])[1] || '';
          const pd = (itm.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)||[])[1] || '';
          return {title: t, summary: d.replace(/(<([^>]+)>)/gi,''), time: pd, source: url};
        });
        renderFeeds(items);
      }
    }catch(err){
      console.warn('feed err', err); alert('Feed fetch failed (CORS may block some sources).');
    }
  }

  // TODOS management
  function renderTodos(){
    todosDiv.innerHTML='';
    state.todos.forEach(it=>{
      const d = document.createElement('div'); d.className='todo-item';
      d.innerHTML = `<input type="checkbox" ${it.done? 'checked':''}> <div style="flex:1"><div style="font-weight:700">${it.title}</div><div class="small muted">${it.note||''}</div></div><button class="btn">Del</button>`;
      const chk = d.querySelector('input'); chk.addEventListener('change', e=>{ it.done = e.target.checked; save(); renderTodos(); });
      d.querySelector('button').addEventListener('click', ()=>{ state.todos.splice(state.todos.indexOf(it),1); save(); renderTodos(); });
      todosDiv.appendChild(d);
    });
  }

  // formulas
  function renderFormulas(){
    formulaList.innerHTML='';
    state.formulas.forEach(f=>{
      const el = document.createElement('div'); el.style.padding='8px'; el.style.borderRadius='8px'; el.style.marginBottom='8px'; el.style.background='linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.015))'; el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>${f.title}</strong><button class="btn">Del</button></div><div class="small muted">${f.body}</div>`;
      el.querySelector('button').addEventListener('click', ()=>{ state.formulas.splice(state.formulas.indexOf(f),1); save(); renderFormulas(); });
      formulaList.appendChild(el);
    });
  }

  // Charts - canvas-based lightweight bar + pie
  function drawBars(canvas, data, labels){
    const ctx = canvas.getContext('2d');
    const DPR = devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * DPR;
    canvas.height = canvas.clientHeight * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
    const pad = 24, W = canvas.clientWidth, H = canvas.clientHeight;
    const gw = (W - pad*2) / Math.max(1, data.length);
    const max = Math.max(1, ...data);
    ctx.font='12px system-ui, sans-serif'; ctx.fillStyle='rgba(255,255,255,.85)';
    data.forEach((v,i)=>{
      const x = pad + i*gw + gw*0.12;
      const h = (v/max) * (H - pad*2);
      const y = H - pad - h;
      const w = gw*0.76;
      const grd = ctx.createLinearGradient(0,y,0,y+h);
      grd.addColorStop(0,'#6aa2ff'); grd.addColorStop(1,'#8a5dff');
      ctx.fillStyle = grd;
      // rounded rect
      const r = 8; const rx=x, ry=y, rw=w, rh=h;
      ctx.beginPath(); ctx.moveTo(rx+r,ry); ctx.arcTo(rx+rw,ry,rx+rw,ry+r,r); ctx.arcTo(rx+rw,ry+rh,rx+rw-r,ry+rh,r); ctx.arcTo(rx,ry+rh,rx,ry+rh-r,r); ctx.arcTo(rx,ry,rx+r,ry,r); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillText(String(Math.round(v)), x+4, y-6);
      ctx.save(); ctx.translate(x+w/2, H - pad + 14); ctx.rotate(-Math.PI/12); ctx.textAlign='center'; ctx.fillText(labels[i]||'',0,0); ctx.restore();
    });
  }

  function drawPie(canvas, map){
    const ctx = canvas.getContext('2d'); const DPR = devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * DPR; canvas.height = canvas.clientHeight * DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
    const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2, r = Math.min(cx,cy)-10;
    const total = Object.values(map).reduce((a,b)=>a+b,0)||1;
    let start = -Math.PI/2;
    const colors = ['#6aa2ff','#8a5dff','#22d3ee','#27d980','#ffb020','#ff5d5d'];
    let i=0;
    for(const k of Object.keys(map)){
      const v = map[k]; const frac = v/total; const end = start + frac*2*Math.PI;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
      const grd = ctx.createLinearGradient(cx, cy-r, cx, cy+r); grd.addColorStop(0, colors[i%colors.length]); grd.addColorStop(1, 'rgba(255,255,255,.85)');
      ctx.fillStyle = grd; ctx.fill();
      const mid = (start+end)/2; const lx = cx + Math.cos(mid)*(r*0.6); const ly = cy + Math.sin(mid)*(r*0.6);
      ctx.fillStyle='rgba(255,255,255,.98)'; ctx.font='12px system-ui, sans-serif'; ctx.textAlign='center'; ctx.fillText(`${k} ${(frac*100).toFixed(0)}%`, lx, ly);
      start = end; i++;
    }
  }

  function refreshCharts(){
    // daily last 14 days from history
    const hist = state.stats.history.slice(-14);
    if(hist.length===0){
      // seed with today's focus
      hist.push({date: todayKey(), focus: state.stats.focusToday || 0});
    }
    const labels = hist.map(h=> h.date.slice(5));
    const data = hist.map(h=> h.focus || 0);
    drawBars(chartDaily, data, labels);
    // phase totals pie
    drawPie(chartPhases, state.stats.phaseTotals || {focus: state.stats.focusToday || 0, short:0, long:0});
  }

  // rollover day -> archive history
  function rolloverDay(){
    const tk = todayKey();
    if(state.stats.day !== tk){
      // push previous day summary
      state.stats.history = state.stats.history || [];
      state.stats.history.push({date: state.stats.day, focus: state.stats.focusToday || 0, pomos: state.stats.pomos || 0, cycles: state.stats.cyclesDone || 0});
      // reset daily values
      state.stats.day = tk;
      state.stats.focusToday = 0; state.stats.pomos = 0; state.stats.cyclesDone = 0;
    }
  }

  // UI bindings
  startBtn.addEventListener('click', ()=> running? pause(): start());
  pauseBtn.addEventListener('click', pause);
  skipBtn.addEventListener('click', skip);
  lapBtn.addEventListener('click', addLap);
  panicBtn.addEventListener('click', panic);
  exportBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='neet_export_'+todayKey()+'.json'; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 1500);
  });
  btnResetStats.addEventListener('click', ()=>{ if(confirm('Reset stats?')){ state.stats = DEFAULT.stats; save(); refreshCharts(); alert('Stats reset'); } });

  // feed controls
  btnLoadFeed && btnLoadFeed.addEventListener('click', ()=>{ const u = feedUrl.value.trim(); if(!u) return alert('Paste a feed URL'); fetchFeed(u); });
  btnSaveFeed && btnSaveFeed.addEventListener('click', ()=>{ const u = feedUrl.value.trim(); if(!u) return alert('Paste a feed URL'); state.feeds = state.feeds || []; state.feeds.push(u); save(); alert('Feed saved'); });

  // todos
  todoInput.addEventListener('keydown', e=>{ if(e.key==='Enter' && todoInput.value.trim()){ state.todos.unshift({id:uid(), title: todoInput.value.trim(), note:'', done:false}); todoInput.value=''; save(); renderTodos(); } });
  function renderTodos(){ todosDiv.innerHTML=''; state.todos.forEach(it=>{ const d=document.createElement('div'); d.className='todo-item'; d.innerHTML = `<input type="checkbox" ${it.done? 'checked':''}> <div style="flex:1"><div style="font-weight:700">${it.title}</div><div class="small muted">${it.note||''}</div></div><button class="btn">Del</button>`; d.querySelector('input').addEventListener('change', e=>{ it.done=e.target.checked; save(); renderTodos(); }); d.querySelector('button').addEventListener('click', ()=>{ state.todos.splice(state.todos.indexOf(it),1); save(); renderTodos(); }); todosDiv.appendChild(d); }); }
  // formulas
  btnAddFormula && btnAddFormula.addEventListener('click', ()=>{
    const title = prompt('Formula title (e.g., Kinetic energy)'), body = prompt('Formula / body'); if(title && body){ state.formulas.unshift({id:uid(), title, body}); save(); renderFormulas(); }
  });
  function renderFormulas(){ formulaList.innerHTML=''; state.formulas.forEach(f=>{ const el=document.createElement('div'); el.style.padding='8px'; el.style.borderRadius='8px'; el.style.marginBottom='8px'; el.style.background='linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.015))'; el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>${f.title}</strong><button class="btn">Del</button></div><div class="small muted">${f.body}</div>`; el.querySelector('button').addEventListener('click', ()=>{ state.formulas.splice(state.formulas.indexOf(f),1); save(); renderFormulas(); }); formulaList.appendChild(el); }); }

  // initial render
  renderTodos(); renderFormulas(); render(); renderFeeds(EMBEDDED_FEEDS); refreshCharts();

  // refresh charts interval
  setInterval(()=> refreshCharts(), 5000);

  // navigation
  const navHome = $('#nav-home'), navFeeds = $('#nav-feeds'), navTools = $('#nav-tools'), navAnalytics = $('#nav-analytics');
  [navHome, navFeeds, navTools, navAnalytics].forEach(btn=> btn && btn.addEventListener('click', ()=>{ [navHome, navFeeds, navTools, navAnalytics].forEach(x=>x.classList.remove('active')); btn.classList.add('active'); const id = btn.id.replace('nav-',''); showSection(id); }));
  function showSection(name){ $('#home').style.display = name==='home'? 'block':'none'; $('#feeds').style.display = name==='feeds'? 'block':'none'; $('#tools').style.display = name==='tools'? 'block':'none'; $('#analytics').style.display = name==='analytics'? 'block':'none'; }

  // small helpers
  function alertOnce(key,msg){ if(localStorage.getItem('neet_hint_'+key)) return; alert(msg); localStorage.setItem('neet_hint_'+key, '1'); }
  // feed fetcher exposed
  window.NEET = { state, save, fetchFeed };

  // service worker registration (PWA)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(()=> console.log('SW registered')).catch(e=> console.warn('SW reg failed', e));
  }

})();