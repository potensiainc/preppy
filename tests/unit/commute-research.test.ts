import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
const provenancePath='../../public/commute/provenance.js';
const viewPath='../../public/commute/research-view.js';
const {parseProvenance}=await import(provenancePath);
const {researchMarkup}=await import(viewPath);
const base=new URL('../../data/research/commute/2026-10-15/',import.meta.url);
const json=async(path:string)=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const dataBytes=await readFile(new URL('../../public/commute/data.json',import.meta.url));
const data=JSON.parse(dataBytes.toString());
const evidence=JSON.parse(await readFile(new URL('../../public/commute/provenance.json',import.meta.url),'utf8'));
const research=JSON.parse(await readFile(new URL('../../public/commute/research-sources.json',import.meta.url),'utf8'));
describe('reviewed public commute research integration',()=>{
  it('preserves every original archive manifest byte hash and the unchanged snapshot',async()=>{
    const manifest=await json('manifest.json');
    for(const file of manifest.files){const raw=await readFile(new URL(file.name,base));expect(raw.length).toBe(file.bytes);expect(createHash('sha256').update(raw).digest('hex')).toBe(file.sha256);}
    expect(createHash('sha256').update(dataBytes).digest('hex')).toBe('71d2e0039b67db21d3102d188d4fe9c0aa449fbf816a5c404d2e0b7c4ba05dc4');
  });
  it('covers all 38 exact identities and retains 163 source records with no live-operation upgrade',()=>{
    expect(research.schools.map((s:{schoolId:string})=>s.schoolId).sort()).toEqual(data.schools.map((s:{id:string})=>s.id).sort());
    expect(research.schools).toHaveLength(38);
    expect(new Set(research.schools.flatMap((s:{sources:{id:string}[]})=>s.sources.map(source=>source.id))).size).toBe(163);
    expect(research.schools.every((s:{currentOperationVerified:boolean})=>s.currentOperationVerified===false)).toBe(true);
  });
  it('accepts only exact stop/direction/time matches as document comparison, not route verification',async()=>{
    const published=await json('routes.json');
    const publishedStops=new Map(published.flatMap((r:{stops:{record_id:string;name:string;time_raw:string}[]})=>r.stops.map(stop=>[stop.record_id,stop] as const)));
    expect(evidence.records).toHaveLength(61);
    expect(parseProvenance(evidence,data.schools)).toHaveLength(61);
    for(const record of evidence.records){
      const school=data.schools.find((s:{id:string})=>s.id===record.schoolId);
      const route=school.routes.find((r:{id:string})=>r.id===record.routeId);
      expect(route.stops[record.sourceStopIndex].direction).toBe(record.direction);
      expect(route.stops[record.sourceStopIndex].time).toBe(record.value);
      const sourceStop=publishedStops.get(record.researchRecordId) as {name:string;time_raw:string};
      expect(route.stops[record.sourceStopIndex].name).toBe(sourceStop.name);
      expect(record.value).toBe(sourceStop.time_raw);
      expect(record.verificationStatus).toBe('document_reviewed');
      expect(record.operatingStatus).toContain('실제 현재 운행 확인 전');
    }
  });
  it('keeps color restrictions, future closure, relative/reference meaning and quarantines explicit',async()=>{
    expect(researchMarkup(research,'yale')).toContain('색상으로 지정된 정류장을 판독하지 못해');
    expect(researchMarkup(research,'kyungbok')).toContain('정확한 폐쇄일은 없으며 현재 폐쇄됐다는 뜻은 아니에요');
    expect(researchMarkup(research,'gyeseong')).toContain('다른 노선 참조');
    expect(researchMarkup(research,'taegang')).toContain('운행 시각으로 반영하지 않았어요');
    expect(researchMarkup(research,'hwarang')).toContain('확정 종료일로 반영하지 않았어요');
    const facts=await json('facts.json');
    expect(facts.some((f:{integration_use:string})=>f.integration_use==='quarantined_quality_issue')).toBe(true);
    expect(evidence.records.some((r:{researchRecordId:string})=>r.researchRecordId==='C044')).toBe(false);
  });
});
