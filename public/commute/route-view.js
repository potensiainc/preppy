import {inScope,sortedRoutes} from './model.js';

const collection=features=>({type:'FeatureCollection',features});
const feature=(geometry,properties)=>({type:'Feature',geometry,properties});
export const validCoordinate=p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=85;
const cache=new WeakMap();

export function getRouteVariants(school){
  if(!school)return [];
  if(!cache.has(school))cache.set(school,['등교','하교'].flatMap(direction=>sortedRoutes(school,direction).map(route=>({
    variantId:`${route.id}|${direction}`,routeId:route.id,name:route.name,direction,
    stops:route.stops.map((p,sourceStopIndex)=>({...p,sourceStopIndex})).filter(p=>p.direction===direction)
  }))));
  return cache.get(school);
}

export function buildRouteView(school,state){
  const all=getRouteVariants(school);
  const totals={all:all.length,morning:all.filter(v=>v.direction==='등교').length,afternoon:all.filter(v=>v.direction==='하교').length};
  const variants=all.filter(v=>state.routeScope==='all'||!state.routeScope||v.direction===state.routeScope);
  const selected=variants.find(v=>v.routeId===state.routeId&&v.direction===state.way)||null;
  const points=new Map(),pointCandidates=new Map(),lines=[];
  let stopRecords=0,scopeStopRecords=0,scopeRouteCount=0,invalidCoordinates=0;
  for(const v of variants){
    const local=v.stops.filter(p=>inScope(p,state));
    const props={variantId:v.variantId,routeId:v.routeId,name:v.name,direction:v.direction,inSelectedArea:local.length>0};
    stopRecords+=v.stops.length;scopeStopRecords+=local.length;if(local.length)scopeRouteCount++;
    // Never connect over a missing coordinate: that would invent a segment.
    if(v.stops.length>1&&v.stops.every(validCoordinate))lines.push(feature({type:'LineString',coordinates:v.stops.map(p=>[p.lon,p.lat])},props));
    for(const p of v.stops){
      if(!validCoordinate(p)){invalidCoordinates++;continue;}
      const key=`${p.lon},${p.lat}`;
      if(!points.has(key)){
        points.set(key,feature({type:'Point',coordinates:[p.lon,p.lat]},{coordinateKey:key,inSelectedArea:false,morning:false,afternoon:false,selected:false}));
        pointCandidates.set(key,[]);
      }
      const point=points.get(key).properties;
      point.inSelectedArea ||= inScope(p,state);
      point[v.direction==='등교'?'morning':'afternoon']=true;
      point.selected ||= selected?.variantId===v.variantId;
      pointCandidates.get(key).push({variantId:v.variantId,sourceStopIndex:p.sourceStopIndex});
    }
  }
  const fitted=selected?[selected]:variants;
  const fitCoordinates=fitted.flatMap(v=>v.stops.filter(validCoordinate).map(p=>[p.lon,p.lat]));
  if(school&&validCoordinate(school))fitCoordinates.push([school.lon,school.lat]);
  return {variants,selected,totals,scopeRouteCount,stopRecords,scopeStopRecords,invalidCoordinates,
    routeFeatures:collection(lines),stopFeatures:collection([...points.values()]),pointCandidates,fitCoordinates};
}
