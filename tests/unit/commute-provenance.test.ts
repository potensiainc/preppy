import {describe,it,expect} from 'vitest';
const path='../../public/commute/provenance.js';
const {parseProvenance,recordsFor,sourceUrl}=await import(path);
const schools=[{id:'s',routes:[{id:'r',stops:[{direction:'등교'},{direction:'등교'},{direction:'하교'}]}]}];
const record={schoolId:'s',routeId:'r',direction:'하교',sourceStopIndex:2,field:'정차 시각',sourceUrl:'https://school.example/timetable.pdf',documentDate:'2025-09-01',sourcePublicationDate:'2026-09-02',attachmentRevisionDate:'2026-09-15',effectiveSchoolYear:'2027',operatingStatus:'2027년 종료 예정',verificationStatus:'conflicting',conditions:['방과후 수업일에 한해 운행'],conflicts:['첨부파일 개정 날짜와 본문 날짜가 달라요.']};
describe('field-level commute evidence',()=>{
  it('retains document date, effective year and complete conditions separately',()=>{
    const records=parseProvenance({schemaVersion:1,records:[record]},schools);
    expect(records).toEqual([record]);
    expect(recordsFor(records,'s','r','하교',2)).toEqual([record]);
    expect(recordsFor(records,'s','r','등교',2)).toEqual([]);
    expect(recordsFor(records,'s','r','하교',1)).toEqual([]);
    expect(recordsFor(records,'s','other','하교',2)).toEqual([]);
  });
  it('rejects unsafe URLs, unknown identities/statuses and schema versions',()=>{
    expect(sourceUrl('javascript:alert(1)')).toBeNull();
    expect(parseProvenance({schemaVersion:2,records:[record]},schools)).toEqual([]);
    expect(parseProvenance({schemaVersion:1,records:[{...record,schoolId:'unknown'},{...record,routeId:'unknown'},{...record,verificationStatus:'verified_by_guess'},{...record,sourceUrl:'data:text/html,test'}]},schools)).toEqual([]);
    expect(parseProvenance({schemaVersion:1,records:[{...record,sourceStopIndex:3},{...record,direction:'등교'},{...record,direction:undefined}]},schools)).toEqual([]);
  });
});
