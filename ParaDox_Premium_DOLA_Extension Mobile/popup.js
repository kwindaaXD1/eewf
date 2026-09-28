(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const store = chrome?.storage?.local;
  const get = (defaults) => new Promise(r => store ? store.get(defaults, r) : r(defaults));
  const set = (obj) => new Promise(r => store ? store.set(obj, r) : r());
  const log = (msg) => { const t=$('#terminal'); if(t) t.innerHTML += `<br>[ParaDox] ${msg}`; };

  // Tabs
  const tabs = {generator:'Studio', prompts:'Prompts', accounts:'Accounts', settings:'Settings', logs:'Logs', downloads:'Downloads'};
  Object.keys(tabs).forEach(name => {
    const b=$(`#tab-${name}`), v=$(`#view-${name}`);
    if(!b || !v) return;
    b.addEventListener('click', () => {
      $$('.nav-btn').forEach(x=>x.classList.remove('active'));
      $$('.tab-content').forEach(x=>x.classList.add('hidden'));
      b.classList.add('active'); v.classList.remove('hidden');
    });
  });

  // Project duration: save + sync to Dola native UI + network override
  $$('.dur-pill').forEach(b => b.addEventListener('click', async () => {
    $$('.dur-pill').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    const duration=String(b.dataset.dur||'30').replace(/\D/g,'')||'30';
    if($('#badge-duration')) $('#badge-duration').textContent=`${duration}s`;
    if($('#sel-duration')) $('#sel-duration').value=duration;
    await set({projectDuration:duration, durationOverride:duration});
    log(`Project duration set to ${duration}s.`);
    try {
      chrome.tabs.query({active:true,currentWindow:true}, tabs => {
        const tab=tabs && tabs[0];
        if(!tab || !/^https:\/\/(www\.)?dola\.com\//i.test(tab.url||'')) {
          // Still stored; content bridge will broadcast on next Dola visit.
          return;
        }
        chrome.tabs.sendMessage(tab.id,{type:'HOSHIN_SET_NATIVE_DURATION', duration}, response => {
          if(chrome.runtime.lastError) return;
          if(response && response.ok) log(`Duration ${duration}s ✓ synced with Dola native control (${response.method||'native'}).`);
        });
        // Forward to MAIN-world network override (extractor.js rewrites request body).
        chrome.tabs.sendMessage(tab.id,{type:'DURATION_OVERRIDE', duration}, ()=>{ if(chrome.runtime.lastError) {} });
      });
    } catch (_) {}
  }));
  // Aspect ratio: keep the existing state, then synchronize through Dola's native UI only.
  $$('.ratio-pill').forEach(b => b.addEventListener('click', async () => {
    $$('.ratio-pill').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    const ratio=b.dataset.ratio; if($('#badge-ratio')) $('#badge-ratio').textContent=ratio;
    await set({projectRatio:ratio, ratioOverride:ratio, targetRatio:ratio});

    try {
      chrome.tabs.query({active:true,currentWindow:true}, tabs => {
        const tab=tabs && tabs[0];
        if(!tab || !/^https:\/\/(www\.)?dola\.com\//i.test(tab.url||'')) {
          log(`Aspect ratio saved as ${ratio}; open Dola to sync it.`);
          return;
        }
        chrome.tabs.sendMessage(tab.id,{type:'HOSHIN_SET_NATIVE_RATIO',ratio}, response => {
          if(chrome.runtime.lastError) { log(`Aspect ratio ${ratio}: Dola sync unavailable on this page.`); return; }
          if(response && response.ok) log(`Aspect ratio ${ratio} ✓ synced with Dola native control.`);
          else log(`Aspect ratio ${ratio} ⚠ not applied by Dola native UI.`);
        });
      });
    } catch (_) { log(`Aspect ratio saved as ${ratio}; native sync unavailable.`); }
  }));
  $('#sel-duration')?.addEventListener('change', e => {
    const b=$(`.dur-pill[data-dur="${e.target.value}"]`); if(b) b.click();
  });

  // Open Dola Studio
  $('#btn-open-studio')?.addEventListener('click', () => chrome.tabs.create({url:'https://dola.com/chat'}));

  // Prompt queue
  let prompts=[], filter='all';
  function parsePrompts(text){
    text=(text||'').trim(); if(!text) return [];
    return text.includes('\n\n') ? text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean) : text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }
  function renderPrompts(){
    const q=($('#input-search-prompts')?.value||'').toLowerCase();
    const shown=prompts.filter(p=>(filter==='all'||(filter==='done')===!!p.done) && p.text.toLowerCase().includes(q));
    if($('#prompt-counter')) $('#prompt-counter').textContent=prompts.length;
    if($('#count-all')) $('#count-all').textContent=prompts.length;
    if($('#count-done')) $('#count-done').textContent=prompts.filter(p=>p.done).length;
    if($('#count-queued')) $('#count-queued').textContent=prompts.filter(p=>!p.done).length;
    const c=$('#prompts-container'); if(!c) return;
    if(!shown.length){c.innerHTML='<div class="empty-state" style="padding:12px 6px;font-size:9.5px;">No matching prompts.</div>'; return;}
    c.innerHTML='';
    shown.forEach((p) => {
      const i=prompts.indexOf(p), row=document.createElement('div');
      row.style.cssText='display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid rgba(239,75,43,.25);border-radius:10px;margin-bottom:8px;min-width:0;';
      const ck=document.createElement('input'); ck.type='checkbox'; ck.checked=!!p.done;
      ck.addEventListener('change', async()=>{prompts[i].done=ck.checked;await set({hoshinPrompts:prompts});renderPrompts();});
      const tx=document.createElement('div'); tx.textContent=`${i+1}. ${p.text}`; tx.style.cssText='font-size:12px;line-height:1.45;flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;';
      row.append(ck,tx); c.append(row);
    });
  }
  $('#textarea-quick-prompts')?.addEventListener('input', e=>{const n=parsePrompts(e.target.value).length;if($('#detected-prompts-count'))$('#detected-prompts-count').textContent=n;});
  $('#btn-add-bulk-prompts')?.addEventListener('click', async()=>{const a=parsePrompts($('#textarea-quick-prompts')?.value);prompts.push(...a.map(text=>({text,done:false})));if($('#textarea-quick-prompts'))$('#textarea-quick-prompts').value='';await set({hoshinPrompts:prompts});renderPrompts();});
  $('#btn-clear-prompts')?.addEventListener('click', async()=>{prompts=[];await set({hoshinPrompts:prompts});renderPrompts();});
  $('#btn-reset-progress')?.addEventListener('click', async()=>{prompts.forEach(p=>p.done=false);await set({hoshinPrompts:prompts});renderPrompts();});
  $('#input-search-prompts')?.addEventListener('input',renderPrompts);
  $$('.filter-pill').forEach(b=>b.addEventListener('click',()=>{$$('.filter-pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');filter=b.dataset.filter;renderPrompts();}));
  $('#btn-trigger-upload')?.addEventListener('click',()=>$('#file-upload-prompts')?.click());
  $('#file-upload-prompts')?.addEventListener('change', async e=>{const f=e.target.files?.[0];if(!f)return;const text=await f.text();prompts.push(...parsePrompts(text).map(text=>({text,done:false})));await set({hoshinPrompts:prompts});renderPrompts();});

  // Local settings: keep controls responsive and persisted.
  const localSettingIds=['sel-credit-limit','chk-autorotate','chk-autonext','chk-auto-dl','chk-safety','chk-telemetry-shield','chk-fingerprint-mask','chk-omni-chain','sel-filename-preset','input-filename-pattern'];
  localSettingIds.forEach(id=>$('#'+id)?.addEventListener('change', async e=>set({['setting_'+id]:e.target.type==='checkbox'?e.target.checked:e.target.value})));
  $$('.btn-tag-chip').forEach(b=>b.addEventListener('click',()=>{const i=$('#input-filename-pattern');if(i){i.value+=b.dataset.tag||'';i.dispatchEvent(new Event('change'));}}));

  // Buttons whose original Channa behavior depends on unavailable/private automation are made responsive without request rewriting.
  const infoButtons={
    'btn-launch-farm':'Parallel account automation is not enabled in this ParaDox build.',
    'btn-next-batch':'Batch account automation is not enabled in this ParaDox build.',
    'btn-download-zip':'Batch ZIP downloader is not enabled in this ParaDox build.',
    'btn-capture-session':'Session/cookie capture is not enabled in this ParaDox build.',
    'btn-import-profile':'Cookie-profile import is not enabled in this ParaDox build.'
  };
  Object.entries(infoButtons).forEach(([id,msg])=>$('#'+id)?.addEventListener('click',()=>{log(msg);const s=$('#farm-status-text');if(s)s.textContent=msg;}));
  $('#btn-fetch')?.addEventListener('click',()=>$('#tab-downloads')?.click());
  $('#btn-clear-session')?.addEventListener('click', async()=>{await set({hoshinPrompts:[],projectDuration:'30',projectRatio:'9:16',durationOverride:'30',ratioOverride:'9:16',targetRatio:'9:16'});prompts=[];renderPrompts();log('Local ParaDox state reset.');});
  $('#btn-toggle-omni-mode')?.addEventListener('click',()=>log('Omni reference UI ready; no request override is enabled.'));

  // Restore
  (async()=>{
    const s=await get({hoshinPrompts:[],projectDuration:'30',projectRatio:'9:16',durationOverride:'30',ratioOverride:'9:16',targetRatio:'9:16'}); prompts=s.hoshinPrompts||[];
    const dur=String(s.durationOverride||s.projectDuration||'30').replace(/\D/g,'')||'30';
    const rat=s.ratioOverride||s.targetRatio||s.projectRatio||'9:16';
    $(`.dur-pill[data-dur="${dur}"]`)?.click();
    $(`.ratio-pill[data-ratio="${rat}"]`)?.click();
    renderPrompts(); log('Popup controller initialized.');
  })();
})();
