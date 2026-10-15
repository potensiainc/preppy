const collator = new Intl.Collator('ko',{numeric:true});
export const allStops = school => school.routes.flatMap(r=>r.stops);
export function inScope(stop,state) {
  return (!state.region || stop.district===state.region) && (!state.neighborhood || stop.code===state.neighborhood);
}
export const scopeStops = (school,state) => allStops(school).filter(s=>inScope(s,state));
export const regionLabel = (data,state) => data.neighborhoods.find(n=>n.code===state.neighborhood)?.name || state.region || '서울·경기 전체';
export function timeLabel(s) {
  if(s.timeNeedsReview) return `${s.time} · 확인 필요`;
  if(s.timeKind==='clock') return s.time;
  if(s.timeKind==='relative_minutes') return `+${s.duration}분`;
  if(s.timeKind==='route_reference') return `${s.time} 참조`;
  return '시간 미제공';
}
export function summary(school,state) {
  const stops=scopeStops(school,state), morning=stops.filter(s=>s.direction==='등교'), afternoon=stops.filter(s=>s.direction==='하교');
  const clocks=morning.filter(s=>s.timeKind==='clock').sort((a,b)=>a.minutes-b.minutes);
  const first=clocks[0]?.time, last=clocks.at(-1)?.time;
  return {stops,morning,afternoon,clockRange:morning.some(s=>s.timeNeedsReview) ? '시각 확인 필요' : first ? (first===last?first:`${first}–${last}`) : '시각 미제공',
    neighborhoods:[...new Set(stops.map(s=>s.neighborhood))],
    morningRoutes:school.routes.filter(r=>r.stops.some(s=>inScope(s,state)&&s.direction==='등교')).length,
    afternoonRoutes:school.routes.filter(r=>r.stops.some(s=>inScope(s,state)&&s.direction==='하교')).length};
}
export function visibleSchools(data,state) {
  return data.schools.filter(s=>(!state.savedOnly||state.saved.has(s.id)) &&
    ((!state.region && !state.neighborhood) || scopeStops(s,state).length>0) &&
    (state.direction==='all' || scopeStops(s,state).some(p=>p.direction===state.direction)))
    .sort((a,b)=>state.sort==='name'?collator.compare(a.name,b.name):scopeStops(b,state).length-scopeStops(a,state).length||collator.compare(a.name,b.name));
}
export function sortedRoutes(school,direction) {
  const numbers=n=>{const m=n.match(/^(\d+)(?:-(\d+))?/);return m?[Number(m[1]),Number(m[2]||0)]:[9999,0];};
  return school.routes.filter(r=>r.stops.some(s=>s.direction===direction)).sort((a,b)=>{
    const x=numbers(a.name),y=numbers(b.name);return x[0]-y[0]||x[1]-y[1]||collator.compare(a.name,b.name);
  });
}
export function search(data,query) {
  const q=query.trim().toLowerCase().replaceAll(' ','');if(!q)return [];
  const normalize=s=>s.toLowerCase().replaceAll(' ','');
  const match=s=>normalize(s).includes(q);
  const result=[];
  for(const r of data.regions)if(match(r.name))result.push({type:'region',id:r.name,label:r.name,sub:`통학 학교 ${r.schoolIds.length}곳`,kind:'지역'});
  for(const s of data.schools)if(match(s.name)||match(s.name.replace(/초$/,'초등학교')))result.push({type:'school',id:s.id,label:s.name,sub:s.district,kind:'학교'});
  for(const n of data.neighborhoods)if(match(n.district+n.name)||match(n.name.replace(/\d+/g,'')))result.push({type:'neighborhood',id:n.code,label:n.name,sub:n.district,kind:'동네'});
  const keys=new Set();
  const bySchool=[];
  for(const s of data.schools){const items=[];for(const r of s.routes)for(const [sourceStopIndex,stop] of r.stops.entries())if(match(stop.name)){
    const key=`${s.id}|${r.id}|${stop.direction}|${stop.name}|${stop.lat}|${stop.lon}|${stop.time}`;if(keys.has(key))continue;keys.add(key);
    items.push({type:'stop',id:s.id,route:r.id,direction:stop.direction,sourceStopIndex,code:stop.code,label:stop.name,sub:`${s.name} · ${stop.district} · ${stop.direction} · ${r.name} · ${timeLabel(stop)}`,kind:'정류장'});
  }if(items.length)bySchool.push(items);}
  // Round robin keeps the first school's many routes from hiding other schools.
  const stops=[];
  while(bySchool.some(items=>items.length)&&stops.length<24){for(const items of bySchool){if(items.length)stops.push(items.shift());}}
  return [...result.slice(0,8),...stops].slice(0,32);
}
export function readUrl(data,href) {
  const q=new URL(href).searchParams;
  const region=data.regions.some(r=>r.name===q.get('area'))?q.get('area'):'';
  const neighborhood=data.neighborhoods.find(n=>n.code===q.get('dong')&&n.district===region)?.code||'';
  const school=data.schools.find(s=>s.id===q.get('school'));
  const way=q.get('way')==='하교'?'하교':'등교';
  const route=school?.routes.find(r=>r.id===q.get('route')&&r.stops.some(s=>s.direction===way));
  const explicitScope=['all','등교','하교'].includes(q.get('scope'))?q.get('scope'):null;
  let routeScope=explicitScope||(['등교','하교'].includes(q.get('way'))?way:'all');
  if(route&&routeScope!=='all'&&routeScope!==way)routeScope=way;
  const filter=['등교','하교'].includes(q.get('filter'))?q.get('filter'):'all';
  const stopIndex=q.has('stop')&&/^\d+$/.test(q.get('stop'))?Number(q.get('stop')):null;
  const selectedStop=stopIndex!==null&&route?.stops[stopIndex]?.direction===way?stopIndex:null;
  return {region,neighborhood,schoolId:school?.id||'',routeId:route?.id||'',way,routeScope,direction:filter,selectedStop};
}
