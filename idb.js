// IndexedDB wrapper
const DB_NAME = "OmniPomDB_v3";
const STORE = "kv";
function openDb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>r.result.createObjectStore(STORE); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function idbGet(k){ return openDb().then(db=>new Promise((res,rej)=>{ const t=db.transaction(STORE,'readonly').objectStore(STORE).get(k); t.onsuccess=e=>res(e.target.result); t.onerror=e=>rej(e); })); }
function idbSet(k,v){ return openDb().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k); tx.onsuccess=()=>res(true); tx.onerror=e=>rej(e); })); }
function idbDelete(k){ return openDb().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite').objectStore(STORE).delete(k); tx.onsuccess=()=>res(true); tx.onerror=e=>rej(e); })); }
