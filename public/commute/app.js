import {icon,escapeHtml as esc} from './icons.js';
import {inScope,summary,visibleSchools,search,readUrl,regionLabel,timeLabel} from './model.js';
import {createCommuteMap} from './map.js';
import {buildRouteView,getRouteVariants} from './route-view.js';

const $=id=>document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let data;
try {const r=await fetch('./data.json');if(!r.ok)throw Error('data');data=await r.json();}
catch {$('results').innerHTML='<div class="empty-state"><h3>자료를 불러오지 못했어요.</h3><p>잠시 후 새로고침해 주세요.</p></div>';throw Error('Commute dataset unavailable');}
const initial=readUrl(data,location.href);
const state={...initial,sort:'coverage',saved:new Set(),compared:[],savedOnly:false,mapMode:'schools',selectedStop:null,mobileMap:!!initial.schoolId,routeSheet:initial.routeId?'timeline':'summary',routePeek:false};
let searchItems=[],toastTimer,commuteMap;
const schoolById=id=>data.schools.find(s=>s.id===id);
const selected=()=>schoolById(state.schoolId);
const routeFor=school=>getRouteVariants(school).find(v=>v.routeId===state.routeId&&v.direction===state.way);
const stopsFor=school=>routeFor(school)?.stops||[];
const crest=(school,extra='')=>`<span class="school-crest tone-${data.schools.indexOf(school)%4} ${extra}" aria-hidden="true">${esc(school.name.slice(0,1))}<i></i></span>`;
function announce(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function normalizeSelection(){
  const school=selected();
  if(!school){state.routeId='';state.selectedStop=null;state.routePeek=false;state.routeSheet='summary';return;}
  if(!['all','등교','하교'].includes(state.routeScope))state.routeScope='all';
  if(state.routeId&&!getRouteVariants(school).some(v=>v.routeId===state.routeId&&v.direction===state.way&&(state.routeScope==='all'||v.direction===state.routeScope))){state.routeId='';state.selectedStop=null;state.routeSheet='summary';state.routePeek=false;}
}
function writeUrl(){
  const q=new URLSearchParams({area:state.region});
  if(state.neighborhood)q.set('dong',state.neighborhood);
  if(state.schoolId){q.set('school',state.schoolId);q.set('scope',state.routeScope);if(state.routeId){q.set('way',state.way);q.set('route',state.routeId);}}
  if(state.direction!=='all')q.set('filter',state.direction);
  const url=`${location.pathname}?${q}`;if(url!==location.pathname+location.search)history.pushState({},'',url);
}
function change(patch,{url=true}={}){Object.assign(state,patch);normalizeSelection();render();if(url)writeUrl();}
function openSchool(id){change({schoolId:id,routeId:'',routeScope:'all',selectedStop:null,mapMode:'schools',mobileMap:true,routeSheet:'summary',routePeek:false});$('school-detail').querySelector('button')?.focus({preventScroll:true});}
function openOverview(scope='all'){change({routeScope:scope,routeId:'',selectedStop:null,routeSheet:'summary',routePeek:false});$('school-detail').querySelector(`[data-scope="${scope}"]`)?.focus({preventScroll:true});}
function openVariant(variantId,{sourceStopIndex,origin='list'}={}){
  const v=getRouteVariants(selected()).find(v=>v.variantId===variantId);if(!v)return;
  const stop=v.stops.find(p=>p.sourceStopIndex===sourceStopIndex);
  change({routeId:v.routeId,way:v.direction,routeScope:state.routeScope==='all'?'all':v.direction,selectedStop:stop?.sourceStopIndex??null,mobileMap:true,routeSheet:origin==='map'?'summary':'timeline',routePeek:!!stop&&origin==='map'});
  if(stop)requestAnimationFrame(()=>selectStop(stop.sourceStopIndex));
  else if(origin!=='map')$('detail-route')?.focus({preventScroll:true});
}
function setRouteSheet(sheet){
  if(!selected())return;
  state.routeSheet=sheet==='summary'?'summary':state.routeId?'timeline':'list';
  state.routePeek=false;render();
  $('school-detail').querySelector(sheet==='summary'?(state.routeId?'[data-action="expand-route"]':'[data-action="route-list"]'):'.route-choice, .stop-row')?.focus({preventScroll:true});
}
function closeSchool(){const id=state.schoolId;change({schoolId:'',routeId:'',selectedStop:null});document.querySelector(`[data-action="open-school"][data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
function setRegion(region,neighborhood=''){change({region,neighborhood,schoolId:'',routeId:'',savedOnly:false,selectedStop:null});$('results').scrollTop=0;}
function card(s){
  const m=summary(s,state),saved=state.saved.has(s.id),compared=state.compared.includes(s.id);
  return `<article class="school-card${s.id===state.schoolId?' selected':''}" data-school="${esc(s.id)}"><div class="card-top">${crest(s)}<button class="school-open" data-action="open-school" data-id="${esc(s.id)}" aria-label="${esc(s.name)} 통학 상세"><h3>${esc(s.name)}</h3><span class="school-location">${icon('pin')}${esc(s.district)} 소재</span></button><button class="heart-button${saved?' saved':''}" data-action="save" data-id="${esc(s.id)}" aria-label="${esc(s.name)} 관심학교 ${saved?'해제':'저장'}" aria-pressed="${saved}">${icon('heart')}</button></div>
    ${s.noBus?'<p class="no-service">통학버스 미운행으로 안내된 학교</p>':`<div class="card-stats"><div><strong>${m.stops.length}<span>개</span></strong><span>지역 내 정류장 기록</span></div><div><strong>${m.morningRoutes}<span> / </span>${m.afternoonRoutes}</strong><span>등교 / 하교 노선</span></div></div><p class="card-time">${icon('sun')}<span>등교 정차 시각</span><b>${esc(m.clockRange)}</b></p>`}
    <div class="card-actions"><button class="compare-add${compared?' added':''}" data-action="compare-add" data-id="${esc(s.id)}" aria-pressed="${compared}" aria-label="${esc(s.name)} 비교 ${compared?'해제':'추가'}"><i>${compared?icon('check'):icon('plus')}</i>${compared?'비교에 담음':'비교하기'}</button><button class="card-route" data-action="open-school" data-id="${esc(s.id)}">통학 보기 ${icon('arrow')}</button></div></article>`;
}
function routeList(view){
  const local=v=>v.stops.some(p=>inScope(p,state));
  const groups=state.region?[[`${regionLabel(data,state)} 경유`,view.variants.filter(local)],['다른 지역 노선',view.variants.filter(v=>!local(v))]]:[['학교 전체 노선',view.variants]];
  return groups.filter(([,items])=>items.length).map(([label,items])=>`<section class="route-group"><h3>${esc(label)} <span>${items.length}</span></h3>${['등교','하교'].map(way=>{
    const routes=items.filter(v=>v.direction===way);if(!routes.length)return '';
    return `<h4 class="way-label ${way==='등교'?'morning':'afternoon'}">${icon(way==='등교'?'sun':'moon')}${way} <span>${routes.length}</span></h4>${routes.map(v=>`<button class="route-choice" data-variant="${esc(v.variantId)}" aria-label="${esc(v.name)} · ${v.direction}, ${v.stops.length}개 정류장"><i class="route-swatch ${way==='등교'?'morning':'afternoon'}"></i><span><strong>${esc(v.name)}</strong><small>${v.direction} · ${v.stops.length}개 정류장${v.stops.length===1?' · 한 지점 기록':''}</small></span>${icon('arrow')}</button>`).join('')}`;
  }).join('')}</section>`).join('');
}
function renderDetail(view){
  const school=selected(),panel=$('school-detail');panel.hidden=!school;document.body.classList.toggle('detail-open',!!school);if(!school)return;
  const route=view.selected,stops=route?.stops||[],local=stops.filter(p=>inScope(p,state));
  panel.dataset.mode=route?'detail':'overview';panel.dataset.scope=state.routeScope;panel.dataset.routeCount=view.variants.length;
  panel.innerHTML=`<div class="detail-top"><div class="detail-eyebrow"><span class="eyebrow">THE EVERYDAY JOURNEY</span><button class="icon-button" data-action="close-school" aria-label="학교 상세 닫기">${icon('close')}</button></div><div class="detail-school">${crest(school)}<div><h2>${esc(school.name)}</h2><p>${esc(school.district)} · 서울 사립초</p></div></div><p class="detail-address">${icon('pin')}${esc(school.address)}</p><span class="detail-review">${icon('info')} 학교 확인 전 자료</span><button class="sheet-collapse" data-action="route-summary" aria-label="지도로 돌아가기">${icon('down')} 지도로</button></div>
    <div class="detail-directions" role="group" aria-label="학교 전체 통학 방향">${[['all','전체',view.totals.all,'layers'],['등교','등교',view.totals.morning,'sun'],['하교','하교',view.totals.afternoon,'moon']].map(([scope,label,count,symbol])=>`<button class="${state.routeScope===scope?'active':''}" data-scope="${scope}" aria-pressed="${state.routeScope===scope}">${icon(symbol)}${label}<em>${count}</em></button>`).join('')}</div>
    ${view.variants.length?`<div class="detail-route-controls"><label for="detail-route">${route?'선택한 노선':'노선 자세히 보기'}<span>학교 전체 자료 기준</span></label><div class="select-wrap"><select id="detail-route" aria-label="통학 노선 선택"><option value="">현재 표시 범위의 모든 노선</option>${view.variants.map(v=>`<option value="${esc(v.variantId)}" ${v.variantId===route?.variantId?'selected':''}>${esc(v.name)} · ${v.direction}${state.region&&v.stops.some(p=>inScope(p,state))?' · 지역 경유':''}</option>`).join('')}</select>${icon('down')}</div>${route?`<div class="route-meta"><strong>${stops.length}개 정류장</strong><span>${state.region?`${esc(regionLabel(data,state))} ${local.length}개`:'원문 순서'}</span></div><button class="overview-return" data-action="all-routes">${icon('layers')} 전체 노선 보기</button><button class="mobile-route-link" data-action="peek-route">${icon('map')} 지도에서 정류장 보기</button>`:''}</div>
    ${route?`<div class="selected-route-summary"><span class="way-label ${route.direction==='등교'?'morning':'afternoon'}">${icon(route.direction==='등교'?'sun':'moon')}${route.direction}</span><strong>${esc(route.name)}</strong><span>${stops.length}개 정류장</span><button data-action="all-routes" aria-label="전체 노선 보기">${icon('layers')}</button></div><div class="timeline" aria-label="정류장 순서">${stops.map((p,i)=>`<button class="stop-row${inScope(p,state)?' local':''}${p.sourceStopIndex===state.selectedStop?' active':''}" data-stop="${p.sourceStopIndex}" aria-label="${i+1}번 ${esc(p.name)} ${esc(timeLabel(p))}"><span class="stop-number">${i+1}</span><span class="stop-main"><strong>${esc(p.name)}</strong><small>${esc(p.district)} ${esc(p.neighborhood)}${p.approximate?' · 추정 위치':''}</small>${inScope(p,state)&&state.region?'<span class="local-badge">선택 지역</span>':''}</span><time class="${p.timeKind==='missing'?'missing':''}">${esc(timeLabel(p))}</time></button>`).join('')}</div>`:`<div class="overview-summary"><p><strong>${view.variants.length}<span>개 노선</span></strong><span>${view.stopRecords.toLocaleString()}개 정류장 기록</span></p><div>${state.region?`${esc(regionLabel(data,state))} 경유 <b>${view.scopeRouteCount}개</b> · 다른 지역도 함께 표시`:'학교의 등하교 통학 범위를 한눈에 확인하세요.'}</div>${state.region&&!view.scopeRouteCount?'<small>선택 지역 경유 기록이 없어 학교 전체 범위를 보여드려요.</small>':''}</div><div class="route-list" aria-label="통학 노선 목록">${routeList(view)}</div>`}
    <p class="route-note">${icon('info')} ${stops.some(p=>p.timeKind==='relative_minutes')?'+분은 출발 기준 상대시간이에요.':'노선 수는 방향·회차별 기록 기준이에요.'}<br>정류장 연결선이며 실제 도로 경로가 아니에요.${view.invalidCoordinates?'<br>위치가 없는 기록은 지도에서 제외했어요.':''}</p>`:`<div class="empty-state">${icon('bus')}<h3>${school.noBus?'통학버스 미운행 안내':'이 방향의 노선 자료가 없어요.'}</h3><p>${school.noBus?'원본에 미운행으로 표시되어 있어요. 현재 운영 여부는 학교에 확인해 주세요.':'실제 미운행을 의미하지 않아요. 다른 방향의 자료를 살펴보세요.'}</p></div>`}
    <div class="detail-foot"><button class="primary-button desktop-detail-action" data-action="compare-add" data-id="${esc(school.id)}">${icon('compare')}${state.compared.includes(school.id)?'비교에서 빼기':'비교에 담기'}</button>${view.variants.length?`<button class="primary-button mobile-detail-action" data-action="${route?'expand-route':'route-list'}">${icon('list')}${route?'전체 시간표 보기':`노선 목록 보기 · ${view.variants.length}`}</button>`:''}<button class="icon-button${state.saved.has(school.id)?' saved':''}" data-action="save" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 관심학교 ${state.saved.has(school.id)?'해제':'저장'}">${icon('heart')}</button><button class="icon-button" data-action="share" aria-label="현재 탐색 링크 복사">${icon('share')}</button></div>`;
  const overviewSummary=panel.querySelector('.overview-summary');
  if(overviewSummary)panel.querySelector('.detail-route-controls').before(overviewSummary);
}
function renderTray(){
  const schools=state.compared.map(schoolById);$('compare-tray').hidden=!schools.length;
  $('compare-tray').innerHTML=`<span class="tray-counter">${icon('compare')}<b>${schools.length}</b> / 3</span><div class="tray-names">${schools.map(s=>`<span class="tray-school">${esc(s.name)}<button data-action="compare-add" data-id="${esc(s.id)}" aria-label="${esc(s.name)} 비교 해제">${icon('close')}</button></span>`).join('')}</div><button class="primary-button" data-action="compare-open">나란히 비교 ${icon('arrow')}</button>`;
}
function render(){
  const schools=visibleSchools(data,state),label=regionLabel(data,state),school=selected(),view=buildRouteView(school,state);
  $('region-name').textContent=state.region||'전체 지역';
  $('neighborhood').innerHTML='<option value="">동네 전체</option>'+data.neighborhoods.filter(n=>n.district===state.region&&!n.outer).sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(n=>`<option value="${esc(n.code)}" ${n.code===state.neighborhood?'selected':''}>${esc(n.name)} · ${n.schoolIds.length}곳</option>`).join('');
  $('neighborhood').disabled=!state.region||data.regions.find(r=>r.name===state.region)?.outer;
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===state.direction);b.setAttribute('aria-pressed',b.dataset.filter===state.direction);});
  document.querySelectorAll('[data-mapmode]').forEach(b=>{b.classList.toggle('active',b.dataset.mapmode===state.mapMode);b.setAttribute('aria-pressed',b.dataset.mapmode===state.mapMode);});
  $('saved-count').textContent=state.saved.size;
  $('nav-saved').classList.toggle('active',state.savedOnly);$('nav-schools').classList.toggle('active',!state.region&&!state.savedOnly);$('nav-commute').classList.toggle('active',!!state.region&&!state.savedOnly);
  $('results-title').innerHTML=`${state.savedOnly?'마음에 담은 학교':state.region?'우리 동네로 오는 학교':'서울 사립초 전체'} <em id="result-count">${schools.length}</em>`;
  $('results').innerHTML=schools.length?schools.map(card).join(''):`<div class="empty-state">${icon(state.savedOnly?'heart':'search')}<h3>${state.savedOnly?'궁금한 학교를 마음에 담아보세요.':'이 조건의 통학 자료가 없어요.'}</h3><p>${state.savedOnly?'학교 카드의 하트를 누르면 여기 모아볼 수 있어요. 새로고침하면 초기화돼요.':'다른 동네 또는 통학 방향으로 살펴보세요. 실제 미운행을 의미하지는 않아요.'}</p><button class="primary-button" data-action="${state.savedOnly?'all-schools':'reset-filter'}">${state.savedOnly?'학교 둘러보기':'지역 전체 보기'}</button></div>`;
  $('map-context').innerHTML=`<span class="context-mark">${icon(school?'bus':'leaf')}</span><p class="eyebrow">${school?'THE WHOLE JOURNEY':'YOUR NEIGHBORHOOD, CONNECTED'}</p><h2>${esc(school?school.name:label)}<span>${school?(view.selected?`${view.selected.direction} · ${esc(view.selected.name)}`:`${state.routeScope==='all'?'등하교 전체':state.routeScope} ${view.variants.length}개 노선`):`<b>${schools.length}</b>개 학교와 연결`}</span></h2><p>${school?'선을 누르면 노선과 정류장을 자세히 볼 수 있어요.':'학교의 위치와 우리 동네 통학 가능성을 함께 살펴보세요.'}</p>`;
  $('map-legend').innerHTML=school?'<span><i class="legend-school"></i>학교</span><span><i class="legend-morning"></i>등교</span><span><i class="legend-afternoon"></i>하교</span><button data-action="about">정류장 연결선 · 도로 경로 아님</button>':`<span><i class="legend-school"></i>${state.mapMode==='coverage'?'학교 수':'학교'}</span><span><i class="legend-region"></i>선택 지역</span><button data-action="about">자료 안내 ${icon('info')}</button>`;
  document.querySelector('[data-action="fit-map"]').setAttribute('aria-label',school?(view.selected?'선택 노선 전체 보기':'표시 중인 모든 노선 보기'):'선택 지역 전체 보기');
  if(state.mapMode==='coverage'&&!school)$('map-context').innerHTML=`<span class="context-mark">${icon('layers')}</span><p class="eyebrow">A WIDER VIEW</p><h2>서울·경기 통학 분포</h2><p>숫자는 등하교 전체 기준의 학교 수예요.<br>지역을 눌러 연결되는 학교를 살펴보세요.</p>`;
  renderDetail(view);renderTray();
  $('school-detail').dataset.allLocal=school&&stopsFor(school).every(p=>inScope(p,state));
  document.body.classList.toggle('route-peek',state.routePeek);
  document.body.classList.toggle('route-summary',!!school&&state.routeSheet==='summary');
  document.body.classList.toggle('route-sheet-open',!!school&&state.routeSheet!=='summary');
  document.body.classList.toggle('mobile-map',state.mobileMap);
  $('mobile-view-toggle').innerHTML=icon(state.mobileMap?'list':'map')+(state.mobileMap?'목록으로 보기':'지도로 보기');
  commuteMap?.update({state,schools,school,routeView:view});
}
function showCandidates(items,anchor){
  const variants=getRouteVariants(selected()),dialog=$('route-candidates');
  const choices=items.map(item=>({...item,variant:variants.find(v=>v.variantId===item.variantId)})).filter(item=>item.variant);
  $('candidate-count').textContent=`이 지점에 ${choices.length}개 노선이 겹쳐 있어요.`;
  $('candidate-list').innerHTML=choices.map(({variant:v,sourceStopIndex})=>`<button class="route-choice" data-variant="${esc(v.variantId)}" ${sourceStopIndex===undefined?'':`data-source-stop="${sourceStopIndex}"`}><i class="route-swatch ${v.direction==='등교'?'morning':'afternoon'}"></i><span><strong>${esc(v.name)} · ${v.direction}</strong><small>${sourceStopIndex===undefined?`${v.stops.length}개 정류장`:esc(v.stops.find(p=>p.sourceStopIndex===sourceStopIndex)?.name||'정류장')}</small></span>${icon('arrow')}</button>`).join('');
  if(window.innerWidth>760){dialog.style.left=`${Math.max(16,Math.min(anchor.x+12,window.innerWidth-348))}px`;dialog.style.top=`${Math.max(16,Math.min(anchor.y,window.innerHeight-370))}px`;}
  else {dialog.style.left='';dialog.style.top='';}
  if(!dialog.open)dialog.showModal();
}
function regionsDialog(){
  const group=outer=>data.regions.filter(r=>r.outer===outer).sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(r=>`<button class="region-option${r.name===state.region?' active':''}" data-region="${esc(r.name)}"><span>${esc(r.name)}</span><small>${r.schoolIds.length}개 학교 ${icon('arrow')}</small></button>`).join('');
  $('region-grid').innerHTML=`<div class="region-grid-content"><button class="all-regions" data-region="">서울·경기 전체 보기<span>38개 학교 ${icon('arrow')}</span></button><h3>서울 <span>25개 자치구</span></h3><div class="region-options">${group(false)}</div><h3>경기 <span>통학 자료가 있는 10개 지역</span></h3><div class="region-options outer">${group(true)}</div></div>`;
  $('region-dialog').showModal();
}
function compareDialog(){
  const schools=state.compared.map(schoolById),stats=schools.map(s=>summary(s,state));
  const rows=[['학교 소재지',schools.map(s=>esc(s.district))],['지역 내 정류장 기록',stats.map(m=>`<b>${m.stops.length}</b>개`)],['등교 / 하교 노선',stats.map(m=>`${m.morningRoutes} / ${m.afternoonRoutes}`)],['등교 정차 시각 범위',stats.map(m=>esc(m.clockRange))],['등교 / 하교 정류장 기록',stats.map(m=>`${m.morning.length} / ${m.afternoon.length}`)],['자료 상태',schools.map(s=>s.noBus?'미운행 안내 · 확인 필요':'학교 공식 확인 전')]];
  $('compare-content').innerHTML=`<p class="comparison-scope">${icon('pin')}<b>${esc(regionLabel(data,state))}</b> · 동일한 지역 조건의 등하교 전체 자료</p><div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th scope="col">비교 항목</th>${schools.map(s=>`<th scope="col">${crest(s)}<strong>${esc(s.name)}</strong><button data-action="compare-detail" data-id="${esc(s.id)}">통학 상세 ${icon('arrow')}</button></th>`).join('')}</tr></thead><tbody>${rows.map(([title,cells])=>`<tr><th scope="row">${title}</th>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="compare-note">${icon('info')} 정류장 기록에는 같은 장소가 중복될 수 있어요. 정차 시각은 탑승 시간이나 통학 소요시간이 아니에요. 서로 다른 회차·학년의 노선이 포함될 수 있으니 학교에 확인해 주세요.</p>`;
  if(!$('compare-dialog').open)$('compare-dialog').showModal();
}
function toggleCompare(id){
  if(state.compared.includes(id))state.compared=state.compared.filter(s=>s!==id);
  else {if(state.compared.length===3){announce('최대 3개 학교를 비교할 수 있어요. 담은 학교 하나를 빼주세요.');return;}state.compared.push(id);}
  render();if($('compare-dialog').open){if(state.compared.length)compareDialog();else $('compare-dialog').close();}
}
function pickSearch(index){
  const item=searchItems[index];if(!item)return;
  $('search').value='';hideSearch();
  if(item.type==='region')setRegion(item.id);
  else if(item.type==='neighborhood'){const n=data.neighborhoods.find(n=>n.code===item.id);setRegion(n.district,n.code);}
  else if(item.type==='school'){setRegion('');openSchool(item.id);}
  else {
    const n=data.neighborhoods.find(n=>n.code===item.code);
    Object.assign(state,{region:n?.district||'',neighborhood:n&&!n.outer?n.code:'',schoolId:item.id,routeScope:item.direction,savedOnly:false,mapMode:'schools'});
    openVariant(`${item.route}|${item.direction}`,{sourceStopIndex:item.sourceStopIndex,origin:'search'});
  }
}
function hideSearch(){$('search-results').hidden=true;$('search').setAttribute('aria-expanded','false');}
function selectStop(index){
  if(!stopsFor(selected()).some(p=>p.sourceStopIndex===index))return;
  state.selectedStop=index;
  if(window.innerWidth<=760){state.mobileMap=true;state.routePeek=true;state.routeSheet='summary';render();requestAnimationFrame(()=>{commuteMap?.resize();commuteMap?.focusStop(index);});}
  else {document.querySelectorAll('[data-stop]').forEach(b=>b.classList.toggle('active',Number(b.dataset.stop)===index));document.querySelector(`[data-stop="${index}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});commuteMap?.focusStop(index);}
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!e.target.closest('.search-area'))hideSearch();if(!button)return;
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.hasAttribute('data-region')){setRegion(button.dataset.region);$('region-dialog').close();return;}
  if(button.hasAttribute('data-search-index')){pickSearch(Number(button.dataset.searchIndex));return;}
  if(button.dataset.filter){change({direction:button.dataset.filter,schoolId:'',routeId:''});return;}
  if(button.dataset.mapmode){change({mapMode:button.dataset.mapmode,schoolId:'',routeId:''},{url:true});return;}
  if(button.dataset.scope){openOverview(button.dataset.scope);return;}
  if(button.dataset.variant){
    const candidate=button.closest('#route-candidates');if(candidate)candidate.close();
    openVariant(button.dataset.variant,{origin:candidate?'map':'list',sourceStopIndex:button.hasAttribute('data-source-stop')?Number(button.dataset.sourceStop):undefined});return;
  }
  if(button.hasAttribute('data-stop')){selectStop(Number(button.dataset.stop));return;}
  const id=button.dataset.id;
  switch(button.dataset.action){
    case 'home': change({region:'서초구',neighborhood:'',schoolId:'',routeId:'',savedOnly:false,direction:'all',mobileMap:false,mapMode:'schools'});break;
    case 'all-schools': change({region:'',neighborhood:'',schoolId:'',routeId:'',savedOnly:false,direction:'all'});break;
    case 'saved': change({region:'',neighborhood:'',schoolId:'',routeId:'',savedOnly:true,direction:'all'});break;
    case 'reset-filter':setRegion(state.region);change({direction:'all'});break;
    case 'regions':regionsDialog();break;
    case 'about':$('about-dialog').showModal();break;
    case 'open-school':openSchool(id);break;
    case 'close-school':closeSchool();break;
    case 'save':if(state.saved.has(id))state.saved.delete(id);else state.saved.add(id);render();announce(state.saved.has(id)?'관심학교에 담았어요. 이 화면에서만 유지돼요.':'관심학교에서 뺐어요.');break;
    case 'compare-add':toggleCompare(id);break;
    case 'compare-open':compareDialog();break;
    case 'compare-detail':$('compare-dialog').close();openSchool(id);break;
    case 'fit-map':commuteMap?.fit();break;
    case 'zoom-in':commuteMap?.zoom(1);break;
    case 'zoom-out':commuteMap?.zoom(-1);break;
    case 'peek-route':selectStop(state.selectedStop??stopsFor(selected())[0]?.sourceStopIndex);break;
    case 'expand-route':setRouteSheet('timeline');break;
    case 'route-list':setRouteSheet('list');break;
    case 'route-summary':setRouteSheet('summary');break;
    case 'all-routes':openOverview();break;
    case 'toggle-view':state.mobileMap=!state.mobileMap;render();requestAnimationFrame(()=>{commuteMap?.resize();commuteMap?.fit();});break;
    case 'share':try{await navigator.clipboard.writeText(location.href);announce('현재 지역과 노선 링크를 복사했어요.');}catch{announce('브라우저 주소창의 링크를 복사해 주세요.');}break;
  }
});
$('neighborhood').addEventListener('change',e=>setRegion(state.region,e.target.value));
$('sort').addEventListener('change',e=>change({sort:e.target.value},{url:false}));
document.addEventListener('change',e=>{if(e.target.id==='detail-route'){if(e.target.value)openVariant(e.target.value);else openOverview(state.routeScope);}});
$('search').addEventListener('input',()=>{
  const query=$('search').value;searchItems=search(data,query);
  $('search-results').innerHTML=searchItems.length?searchItems.map((r,i)=>`<button class="search-result" data-search-index="${i}"><span class="result-kind">${icon(r.type==='school'?'school':r.type==='stop'?'bus':'pin')}</span><span><strong>${esc(r.label)}</strong><small>${esc(r.sub)}</small></span><em>${r.kind}</em></button>`).join(''):'<p class="search-empty">일치하는 학교·동네·정류장이 없어요.</p>';
  $('search-results').hidden=!query.trim();$('search').setAttribute('aria-expanded',!!query.trim());
});
$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pickSearch(0);}if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}if(e.key==='Escape'){hideSearch();e.stopPropagation();}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.querySelector('dialog[open]')){e.preventDefault();document.querySelector('dialog[open]').close();return;}
  if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('search').focus();}
  if(e.key==='Escape'&&!document.querySelector('dialog[open]')){
    if(!$('search-results').hidden){hideSearch();return;}
    if(!state.schoolId)return;
    e.preventDefault();
    if(window.innerWidth<=760&&state.routeSheet!=='summary')setRouteSheet('summary');
    else if(state.routeId)openOverview(state.routeScope);
    else closeSchool();
  }
  if(e.target.matches('.search-result')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const next=e.key==='ArrowDown'?e.target.nextElementSibling:e.target.previousElementSibling;next?.focus();}
});
window.addEventListener('popstate',()=>{const parsed=readUrl(data,location.href);Object.assign(state,parsed,{savedOnly:false,selectedStop:null,routePeek:false,routeSheet:parsed.routeId?'timeline':'summary',mobileMap:!!parsed.schoolId});normalizeSelection();render();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
normalizeSelection();render();
try {commuteMap=createCommuteMap($('map'),data,{onSchool:openSchool,onRegion:region=>{state.mapMode='schools';setRegion(region);},onStop:selectStop,onRoute:(id,options)=>openVariant(id,{...options,origin:'map'}),onCandidates:showCandidates});render();}
catch {$('map-message').hidden=false;$('map-message').textContent='이 브라우저에서는 지도를 표시할 수 없어요. 목록·시간표·학교 비교는 계속 이용할 수 있어요.';}
