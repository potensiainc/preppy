import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),base=path.join(root,'data/research/commute/2026-10-15');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const snapshot=JSON.parse(fs.readFileSync('public/commute/data.json','utf8'));
const sources=read('sources.json'),schools=read('schools.json'),routes=read('routes.json');
const notes={
  younghoon:['공식 게시물의 현재 첨부파일은 파일명에 2026-09-15 개정일이 있어요. 본문에 더 오래된 날짜가 있어 실제 시행일은 확인이 필요해요. 전체 시간표를 추출한 자료는 아니에요.'],
  yale:['2026 조달 계획에는 파란 표시 정류장을 2026 신입생부터 신청할 수 없다는 조건이 있어요. 색상으로 지정된 정류장을 판독하지 못해 특정 정류장의 이용 자격을 판단할 수 없어요. 계약 종료 연도와 일부 시각에도 모순이 있어요.'],
  kyungbok:['공식 정류장 이름에 “경남 현대아파트(2027년 폐쇄)”가 있어요. 정확한 폐쇄일은 없으며 현재 폐쇄됐다는 뜻은 아니에요. 하교 00:00 표시는 시각 미제공이며 자정 출발이 아니에요. 현재 홈페이지의 14개 노선과 과거 경로의 12개 노선을 구분해야 해요.'],
  gyeseong:['하교의 “20분”은 소요분이며 정차 시각이 아니에요. 등교의 “9호”는 다른 노선 참조예요. 서석대·한티역·뱅뱅사거리의 요일 배정 설명이 페이지마다 달라 자동으로 하나를 선택하지 않았어요.'],
  myongji:['43개 기록은 방향·요일·회차별 기록이에요. 적용 학년도는 명시되지 않았어요. URL의 date=261006을 게시일이나 시행일로 해석하지 않았어요. 이전 입찰표로 현재 연결 자료를 덮어쓰면 안 돼요.'],
  taegang:['일부 하교 추출 시각이 출발 시각보다 이르거나 앞뒤 순서와 맞지 않아 운행 시각으로 반영하지 않았어요. 원문 오기인지 추출 문제인지 확인 전이에요.'],
  hwarang:['계약 기간의 추출 문장이 “2026년 3월 1일 ~ 2027월 2월 28일”로 나와요. 실제 이미지 글자를 확인하지 못해 종료일은 미확인이에요. 2027-02-28을 확정 종료일로 반영하지 않았어요.'],
  uchon:['19대는 최초 조달 계획이에요. 이후 재공고는 내용을 읽지 못했고 참고 노선은 2025년 자료예요. 현재 운행 대수로 확정할 수 없어요.'],
  kwangwoon:['2026 입찰에 포함된 자료라도 내부 적용일이 2025년인 자료는 2025년 참고자료로 구분해요.'],
  kyonggi:['장래 폐쇄·신입생 제한의 일부 단서는 2차 자료에만 있어요. PREPPY의 기존 설명을 독립적인 공식 검증으로 취급하지 않아요.'],
  kyunghee:['장래 폐쇄와 신입생 제한의 2차 자료 단서는 공식 확정으로 반영하지 않았어요. 공식 문서 확인이 필요해요.'],
  unhyun:['미운행 주장은 공식 확인 전인 2차 자료예요. 자료 확인 실패를 버스 미운행으로 해석하면 안 돼요.']
};
const common='게시된 자료나 조달 계획을 읽은 범위예요. 실제 현재 운행·좌석·신입생 이용 자격·2027학년도 운행은 확인 전이에요.';
const output={schemaVersion:1,researchDate:'2026-10-15',libraryFileId:'libfile_d27f96e991e081918e3cb8e765889609',schools:schools.map(s=>({schoolId:s.school_id,coverage:s.coverage_class,currentOperationVerified:false,notes:[common,...(notes[s.school_id]||[])],sources:sources.filter(source=>source.school_ids.includes(s.school_id)).map(source=>({id:source.source_id,title:source.title,url:source.url,status:source.evidence_status,documentRole:source.document_role,publicationDate:source.publication_date,revisionDate:source.document_revision_date,schoolYear:source.school_year,fetchedDate:source.fetched_date,conditions:source.restrictions||[],unresolved:source.unresolved_questions||[]}))}))};
fs.writeFileSync('public/commute/research-sources.json',JSON.stringify(output,null,2)+'\n');
// Exact original route name, direction, stop name, clock kind and clock value only.
// No inferred round/day/name aliases, no unverified time replacement.
const evidence=[],matched=[];
for(const route of routes){
  if(route.evidence_status!=='official_verified')continue;
  const school=snapshot.schools.find(s=>s.id===route.school_id);if(!school)throw Error('school identity');
  const candidates=school.routes.filter(r=>r.name===route.route&&r.stops.some(p=>p.direction===route.direction));
  if(candidates.length!==1)continue;
  const original=candidates[0],source=sources.find(s=>s.source_id===route.source_id);
  if(!source)throw Error('source identity');
  for(const stop of route.stops){
    if(stop.time_kind!=='clock')continue;
    const indexes=original.stops.flatMap((p,index)=>p.direction===route.direction&&p.name===stop.name&&p.timeKind==='clock'&&p.time===stop.time_raw?[index]:[]);
    if(indexes.length!==1)continue;
    evidence.push({schoolId:school.id,routeId:original.id,direction:route.direction,sourceStopIndex:indexes[0],field:'공식 게시표의 정차 시각',value:stop.time_raw,sourceUrl:route.source_url,sourceLabel:route.source_title,verificationStatus:'document_reviewed',...(source.publication_date?{sourcePublicationDate:source.publication_date}:{}),...(source.document_revision_date?{attachmentRevisionDate:source.document_revision_date}:{}),...(source.school_year?{effectiveSchoolYear:String(source.school_year)}:{}),operatingStatus:'게시 자료 내용 대조 · 실제 현재 운행 확인 전',conditions:[common,...(notes[school.id]||[]),...(source.restrictions||[]),...(route.caution?[route.caution]:[])],researchRecordId:stop.record_id,sourceIds:stop.source_ids});
    matched.push({schoolId:school.id,routeId:original.id,sourceStopIndex:indexes[0],researchRecordId:stop.record_id});
  }
}
fs.writeFileSync('public/commute/provenance.json',JSON.stringify({schemaVersion:1,records:evidence},null,2)+'\n');
fs.writeFileSync(path.join(base,'integration-report.json'),JSON.stringify({strategy:'additive exact field matches; original snapshot untouched',schoolCount:38,sourceRecords:sources.length,researchRouteRecords:routes.length,researchStopRows:routes.reduce((n,r)=>n+r.stops.length,0),matchedClockFields:matched.length,matched,notImported:['all quarantined and historical/secondary facts as current operation','unmatched route/day/round records','any timetable replacement','grade or new-pupil eligibility inference'],currentOperationVerified:false},null,2)+'\n');
console.log(JSON.stringify({schools:output.schools.length,sources:sources.length,matchedClockFields:evidence.length}));
