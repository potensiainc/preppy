// Additive evidence only: never rewrites the third-party timetable.
const statuses={unverified:'확인 전',document_reviewed:'문서 내용 대조',school_confirmed:'학교 확인',conflicting:'자료 간 내용이 달라요',inaccessible:'원문 접근 불가'};
export function sourceUrl(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export function parseProvenance(value,schools){
  if(value?.schemaVersion!==1||!Array.isArray(value.records))return [];
  const allowed=new Set(schools.map(s=>s.id));
  return value.records.filter(r=>r&&allowed.has(r.schoolId)&&typeof r.field==='string'&&
    Object.hasOwn(statuses,r.verificationStatus)&&sourceUrl(r.sourceUrl)&&
    (!r.routeId||schools.find(s=>s.id===r.schoolId).routes.some(route=>route.id===r.routeId))&&
    (r.sourceStopIndex===undefined||(r.routeId&&Number.isInteger(r.sourceStopIndex)&&r.sourceStopIndex>=0))&&
    (r.direction===undefined||['등교','하교'].includes(r.direction))&&
    ['sourceLabel','documentDate','sourcePublicationDate','attachmentRevisionDate','effectiveSchoolYear','operatingStatus','reviewedAt'].every(key=>r[key]===undefined||typeof r[key]==='string')&&
    ['conditions','conflicts'].every(key=>r[key]===undefined||(Array.isArray(r[key])&&r[key].every(c=>typeof c==='string'))));
}
export function recordsFor(records,schoolId,routeId,direction,sourceStopIndex){
  return records.filter(r=>r.schoolId===schoolId&&(!r.routeId||r.routeId===routeId)&&
    (!r.direction||r.direction===direction)&&
    (r.sourceStopIndex===undefined||r.sourceStopIndex===sourceStopIndex));
}
export const verificationLabel=status=>statuses[status]||statuses.unverified;
