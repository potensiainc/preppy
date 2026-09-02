import { icon, escapeHtml as esc } from './icons.js';
import { timeLabel } from './model.js';
import { validCoordinate } from './route-view.js';

const collection = features => ({type:'FeatureCollection',features});
const feature = (geometry,properties={}) => ({type:'Feature',geometry,properties});
const polygon = s => feature({type:'Polygon',coordinates:s.rings},{name:s.name});
const empty = collection([]);
const blank = {version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eeefe8'}}]};

export function createCommuteMap(container,data,callbacks) {
  const map = new maplibregl.Map({container,style:blank,center:[127.015,37.53],zoom:10.5,minZoom:8,maxZoom:17,
    attributionControl:false,renderWorldCopies:false,pitchWithRotate:false,dragRotate:false});
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'지역 경계 · 수집 자료 기준'}),'bottom-right');
  let current, ready=false, geometryKey='', markers=[], popup,hoverPopup,hoverKey='',fitFrame;
  const message=document.getElementById('map-message');
  const regionFeatures=data.regionShapes.map(s=>{
    const f=polygon(s);f.properties.count=data.regions.find(r=>r.name===s.name)?.schoolIds.length||0;return f;
  });
  function layers() {
    map.addSource('regions',{type:'geojson',data:collection(regionFeatures)});
    map.addSource('selected-region',{type:'geojson',data:empty});
    map.addSource('commute-routes',{type:'geojson',data:empty});
    map.addSource('commute-stops',{type:'geojson',data:empty});
    map.addLayer({id:'region-fill',type:'fill',source:'regions',paint:{'fill-color':'#ced8cb','fill-opacity':.12}});
    map.addLayer({id:'region-border',type:'line',source:'regions',paint:{'line-color':'#a2b3a0','line-opacity':.55,'line-width':1}});
    map.addLayer({id:'selected-fill',type:'fill',source:'selected-region',paint:{'fill-color':'#9eb59c','fill-opacity':.24}});
    map.addLayer({id:'selected-border',type:'line',source:'selected-region',paint:{'line-color':'#7d9779','line-width':2,'line-dasharray':[3,2]}});
    const color=['match',['get','direction'],'등교','#318874','#dc7b5c'];
    const layout={'line-cap':'round','line-join':'round'};
    map.addLayer({id:'route-line',type:'line',source:'commute-routes',paint:{'line-color':color,'line-width':2,'line-opacity':.75},layout});
    map.addLayer({id:'route-halo',type:'line',source:'commute-routes',filter:['==','variantId',''],paint:{'line-color':'#fffdf6','line-width':7,'line-opacity':.95},layout});
    map.addLayer({id:'route-selected',type:'line',source:'commute-routes',filter:['==','variantId',''],paint:{'line-color':color,'line-width':4,'line-opacity':1},layout});
    map.addLayer({id:'route-hover',type:'line',source:'commute-routes',filter:['==','variantId',''],paint:{'line-color':color,'line-width':4,'line-opacity':.95},layout});
    map.addLayer({id:'route-points',type:'circle',source:'commute-stops',paint:{'circle-radius':['interpolate',['linear'],['zoom'],9,1.8,14,3.3],
      'circle-color':['case',['all',['get','morning'],['get','afternoon']],'#687b72',['get','morning'],'#318874','#dc7b5c'],
      'circle-stroke-color':'#fffdf6','circle-stroke-width':.8,'circle-opacity':.85}});
    ready=true;if(current)update(current,true);
  }
  map.on('style.load',layers);
  map.on('error',()=>{message.hidden=false;message.textContent='일부 배경지도를 불러오지 못했어요. 학교·노선 데이터는 계속 볼 수 있어요.';});
  // The app remains usable with its local boundaries when the public basemap is unavailable.
  fetch('https://tiles.openfreemap.org/styles/positron',{signal:AbortSignal.timeout(12000)})
    .then(r=>{if(!r.ok)throw Error('basemap');return r.json();})
    .then(style=>{
      for(const layer of style.layers){
        if(layer.type==='background')layer.paint['background-color']='#f0f0e9';
        if(layer.id==='water'&&layer.paint)layer.paint['fill-color']='#c5dadd';
        if(layer.type==='symbol'&&layer.layout?.['text-field']){
          const field=JSON.stringify(layer.layout['text-field']);
          if(field.includes('name'))layer.layout['text-field']=['coalesce',['get','name:ko'],['get','name'],['get','name:en'],''];
        }
      }
      ready=false;map.setStyle(style,{diff:false});
    }).catch(()=>{message.hidden=false;message.textContent='배경지도 연결이 없어 지역 경계와 통학 데이터만 표시합니다.';});
  function marker(coords,html,className,label,onClick){
    const wrapper=document.createElement('div'),button=document.createElement('button');
    button.className=className;button.innerHTML=html;button.setAttribute('aria-label',label);
    button.addEventListener('click',e=>{e.stopPropagation();onClick();});wrapper.append(button);
    const m=new maplibregl.Marker({element:wrapper,anchor:'center'}).setLngLat(coords).addTo(map);markers.push(m);return button;
  }
  function shapeFor(state){
    if(state.neighborhood){const shape=data.neighborhoodShapes[state.neighborhood];return shape?polygon(shape):null;}
    return regionFeatures.find(f=>f.properties.name===state.region)||null;
  }
  function fit(){
    if(!current||container.clientWidth<160||container.clientHeight<160)return;
    map.resize();
    const {state,schools,school,routeView}=current;
    let coords=[];
    if(school){coords=routeView.fitCoordinates;}
    else {
      const shape=shapeFor(state);
      if(shape)coords.push(...shape.geometry.coordinates.flat());
      coords.push(...schools.map(s=>[s.lon,s.lat]));
      if(!coords.length)coords=data.regionShapes.filter(s=>!data.regions.find(r=>r.name===s.name)?.outer).flatMap(s=>s.rings.flat());
    }
    if(!coords.length)return;
    const bounds=new maplibregl.LngLatBounds();coords.forEach(p=>bounds.extend(p));
    const detail=school&&window.innerWidth>760;
    const panel=document.getElementById('school-detail').getBoundingClientRect();
    const pad={top:75,bottom:school?65:105,left:60,right:detail?Math.min(panel.width+50,container.clientWidth*.47):65};
    // Large mobile sheets cover the map temporarily; reserve the compact sheet's
    // space so collapsing the sheet reveals the same fitted route without a jump.
    const mobilePanel=state.routeSheet==='summary'?panel.height:230;
    if(window.innerWidth<761)Object.assign(pad,{top:40,bottom:school?Math.min(mobilePanel+30,Math.max(80,container.clientHeight-220)):120,left:30,right:30});
    map.fitBounds(bounds,{padding:pad,maxZoom:state.neighborhood?14:12.5,duration:650,essential:false});
  }
  function update(next,force=false){
    current=next;if(!ready)return;
    const {state,schools,school,routeView}=next,stops=routeView.selected?.stops||[];
    const shape=shapeFor(state);
    map.getSource('selected-region').setData(collection(shape?[shape]:[]));
    const coverage=state.mapMode==='coverage'&&!school;
    map.setPaintProperty('region-fill','fill-color',coverage?['interpolate',['linear'],['get','count'],0,'#e7eade',5,'#d0ddc5',15,'#93b29b',30,'#4c7e69']:'#ced8cb');
    map.setPaintProperty('region-fill','fill-opacity',coverage?.65:.12);
    map.getSource('commute-routes').setData(routeView.routeFeatures);
    map.getSource('commute-stops').setData(routeView.stopFeatures);
    const selectedId=routeView.selected?.variantId||'';
    map.setPaintProperty('route-line','line-opacity',selectedId ? .12 : state.region?['case',['get','inSelectedArea'],.8,.23]:.7);
    map.setPaintProperty('route-line','line-width',selectedId?1.5:2);
    map.setPaintProperty('route-points','circle-opacity',selectedId?['case',['get','selected'],0,.15]:state.region?['case',['get','inSelectedArea'],.9,.35]:.85);
    for(const id of ['route-halo','route-selected'])map.setFilter(id,['==','variantId',selectedId]);
    clearHover();
    container.dataset.routeLines=routeView.routeFeatures.features.length;
    container.dataset.routePoints=routeView.stopFeatures.features.length;
    container.dataset.selectedVariant=selectedId;
    markers.forEach(m=>m.remove());markers=[];
    if(coverage){
      for(const s of data.regionShapes){
        const points=s.rings.flat(), xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
        const n=data.regions.find(r=>r.name===s.name)?.schoolIds.length||0;
        marker([(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],`${esc(s.name)}<b>${n}</b>`,'region-label',`${s.name}, 통학 학교 ${n}곳`,()=>callbacks.onRegion(s.name));
      }
    }else{
      const plotted=school?[school]:schools;
      const groups=[];
      for(const s of plotted){
        const p=map.project([s.lon,s.lat]);
        const group=!school&&map.getZoom()<13?groups.find(g=>Math.abs(g.x-p.x)<96&&Math.abs(g.y-p.y)<43):null;
        if(group)group.schools.push(s);else groups.push({x:p.x,y:p.y,schools:[s]});
      }
      for(const group of groups){
        if(group.schools.length===1){const s=group.schools[0];marker([s.lon,s.lat],`<span class="marker-symbol">${icon('school')}</span>${esc(s.name)}`,
          `map-school-marker${s.id===school?.id?' selected':''}`,`${s.name} 지도에서 열기`,()=>callbacks.onSchool(s.id));}
        else {
          const members=group.schools,center=[members.reduce((n,s)=>n+s.lon,0)/members.length,members.reduce((n,s)=>n+s.lat,0)/members.length];
          marker(center,`<span class="marker-symbol">${members.length}</span>개 학교 ${icon('plus')}`,'map-school-marker cluster-marker',`${members.length}개 학교 묶음 확대: ${members.map(s=>s.name).join(', ')}`,()=>{
            const bounds=new maplibregl.LngLatBounds();members.forEach(s=>bounds.extend([s.lon,s.lat]));map.fitBounds(bounds,{padding:105,maxZoom:14,duration:500});
          });
        }
      }
    }
    stops.forEach((p,i)=>{if(validCoordinate(p)){const button=marker([p.lon,p.lat],String(i+1),`map-stop-label ${p.direction==='등교'?'morning':'afternoon'}${p.approximate?' approximate':''}${p.sourceStopIndex===state.selectedStop?' selected':''}`,
      `${i+1}번 ${p.name} ${timeLabel(p)}`,()=>callbacks.onStop(p.sourceStopIndex));button.dataset.sourceStop=p.sourceStopIndex;}});
    const key=[state.region,state.neighborhood,state.mapMode,school?.id,state.routeScope,selectedId,school?'':schools.map(s=>s.id).join(',')].join('|');
    if(key!==geometryKey||force){geometryKey=key;popup?.remove();scheduleFit();}
  }
  function focusStop(index){
    const p=current?.routeView.selected?.stops.find(p=>p.sourceStopIndex===index);if(!p||!validCoordinate(p))return;
    container.querySelectorAll('.map-stop-label').forEach(b=>b.classList.toggle('selected',Number(b.dataset.sourceStop)===index));
    popup?.remove();popup=new maplibregl.Popup({offset:16,closeButton:false,maxWidth:'250px'}).setLngLat([p.lon,p.lat])
      .setHTML(`<div class="map-popup"><strong>${esc(p.name)}</strong><span>${esc(timeLabel(p))} · ${esc(p.neighborhood)}${p.approximate?' · 추정 위치':''}</span></div>`).addTo(map);
    const offset=window.innerWidth>760?[-155,0]:[0,-110];map.easeTo({center:[p.lon,p.lat],zoom:Math.max(map.getZoom(),13.5),offset,duration:500});
  }
  function candidatesAt(point,touch=false){
    if(!ready||!current?.school)return [];
    const radius=touch?12:6;
    const hits=map.queryRenderedFeatures([[point.x-radius,point.y-radius],[point.x+radius,point.y+radius]],{layers:['route-points','route-line']});
    const candidates=new Map();
    // Prefer the nearest stop when the same route is also hit by its line.
    hits.filter(f=>f.layer.id==='route-points').sort((a,b)=>map.project(a.geometry.coordinates).dist(point)-map.project(b.geometry.coordinates).dist(point)).forEach(f=>{
      for(const item of current.routeView.pointCandidates.get(f.properties.coordinateKey)||[])if(!candidates.has(item.variantId))candidates.set(item.variantId,item);
    });
    for(const f of hits.filter(f=>f.layer.id==='route-line'))if(!candidates.has(f.properties.variantId))candidates.set(f.properties.variantId,{variantId:f.properties.variantId});
    return current.routeView.variants.filter(v=>candidates.has(v.variantId)).map(v=>candidates.get(v.variantId));
  }
  function clearHover(){
    hoverKey='';hoverPopup?.remove();hoverPopup=null;map.getCanvas().style.cursor='';
    if(ready)map.setFilter('route-hover',['==','variantId','']);
  }
  map.on('mousemove',e=>{
    if(window.matchMedia('(pointer: coarse)').matches||e.originalEvent.target.closest('button'))return;
    const items=candidatesAt(e.point),ids=items.map(i=>i.variantId),key=ids.join(',');
    if(!items.length){clearHover();return;}
    map.getCanvas().style.cursor='pointer';
    if(key===hoverKey){hoverPopup?.setLngLat(e.lngLat);return;}
    clearHover();hoverKey=key;map.getCanvas().style.cursor='pointer';
    map.setFilter('route-hover',['in','variantId',...ids]);
    const v=current.routeView.variants.find(v=>v.variantId===ids[0]);
    hoverPopup=new maplibregl.Popup({closeButton:false,offset:12,className:'route-hover-popup'}).setLngLat(e.lngLat).setHTML(`<div class="map-popup"><strong>${items.length>1?`${items.length}개 노선이 겹친 지점`:`${esc(v.name)} · ${v.direction}`}</strong><span>눌러서 ${items.length>1?'노선 선택':'자세히 보기'}</span></div>`).addTo(map);
  });
  container.addEventListener('mouseleave',clearHover);
  map.on('click',e=>{
    if(e.originalEvent.target.closest('button'))return;
    const items=candidatesAt(e.point,e.originalEvent.pointerType==='touch'||window.matchMedia('(pointer: coarse)').matches);clearHover();
    if(items.length===1)callbacks.onRoute(items[0].variantId,{sourceStopIndex:items[0].sourceStopIndex});
    else if(items.length>1){const box=container.getBoundingClientRect();callbacks.onCandidates(items,{x:box.left+e.point.x,y:box.top+e.point.y});}
  });
  function scheduleFit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(()=>{fit();if(current?.state.selectedStop!==null)focusStop(current?.state.selectedStop);});}
  const observer=new ResizeObserver(()=>{map.resize();if(current)scheduleFit();});observer.observe(container);
  map.on('moveend',()=>{if(ready&&current&&!current.school)update(current);});
  return {update,fit,focusStop,zoom:delta=>map.zoomTo(map.getZoom()+delta),resize:()=>map.resize()};
}
