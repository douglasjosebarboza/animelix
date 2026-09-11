const store = new Map<string,{fails:number[],openUntil:number}>();
export function isOpen(key:string){ const s=store.get(key); return !!s && Date.now()<s.openUntil; }
export function recordSuccess(key:string){ store.delete(key); }
export function recordFailure(key:string){
  const now=Date.now(); const s=store.get(key)??{fails:[],openUntil:0};
  s.fails=s.fails.filter(t=>now-t<60000); s.fails.push(now);
  if(s.fails.length>=3) s.openUntil=now+10000;
  store.set(key,s);
}
export function _reset(){ store.clear(); }
