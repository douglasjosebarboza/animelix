const store = new Map<string, number[]>();
export function rateLimit(key:string, limit=30, windowMs=60000){
  const now=Date.now(); const arr=(store.get(key)||[]).filter(t=>now-t<windowMs);
  if(arr.length>=limit) return {ok:false, remaining:0};
  arr.push(now); store.set(key,arr); return {ok:true, remaining: limit-arr.length};
}
export function _clear(){ store.clear(); }
