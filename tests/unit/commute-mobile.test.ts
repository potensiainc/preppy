import {readFile} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
const modelPath='../../public/commute/model.js';
const savesPath='../../public/commute/saves.js';
const {search,readUrl}=await import(modelPath);
const {readSaves,writeSaves,SAVE_KEY}=await import(savesPath);
type Stop={direction:string};
type Route={id:string;stops:Stop[]};
type School={id:string;routes:Route[]};
type Result={type:string;label:string;id:string;direction:string};
const data=JSON.parse(await readFile(new URL('../../public/commute/data.json',import.meta.url),'utf8'));
describe('schoolmap search and browser saves',()=>{
  it('finds locality aliases and includes multiple schools rather than first-school flooding',()=>{
    const results=search(data,'목동');
    expect(results.some((r:Result)=>r.type==='neighborhood'&&r.label==='목1동')).toBe(true);
    expect(new Set(results.filter((r:Result)=>r.type==='stop').map((r:Result)=>r.id)).size).toBeGreaterThan(2);
  });
  it('keeps direction and round visible and distinct for the same stop',()=>{
    const stop={name:'같은 정류장',district:'구',lat:37,lon:127,time:'07:10'};
    const fixture={regions:[],neighborhoods:[],schools:[{id:'s',name:'학교',district:'구',routes:[{id:'r',name:'1회',stops:[{...stop,direction:'등교'},{...stop,direction:'하교'}]}]}]};
    const results=search(fixture,'같은');
    expect(results.map((r:Result)=>r.direction)).toEqual(['등교','하교']);
    expect(results[1].sub).toContain('하교 · 1회');
  });
  it('restores route direction while rejecting invalid URL scope',()=>{
    const school=data.schools.find((s:School)=>s.routes.some((r:Route)=>r.stops.some((p:Stop)=>p.direction==='하교')));
    const route=school.routes.find((r:Route)=>r.stops.some((p:Stop)=>p.direction==='하교'));
    const restored=readUrl(data,`https://preppy.kr/schoolmap?school=${school.id}&route=${route.id}&way=하교&scope=등교`);
    expect(restored.way).toBe('하교');expect(restored.routeScope).toBe('하교');expect(restored.routeId).toBe(route.id);
    const index=route.stops.findIndex((p:Stop)=>p.direction==='하교');
    expect(readUrl(data,`https://preppy.kr/schoolmap?school=${school.id}&route=${route.id}&way=하교&stop=${index}`).selectedStop).toBe(index);
    expect(readUrl(data,`https://preppy.kr/schoolmap?school=${school.id}&route=${route.id}&way=하교&stop=99999`).selectedStop).toBeNull();
  });
  it('validates schema, deduplicates and drops unknown IDs without storing personal fields',()=>{
    let raw=JSON.stringify({version:1,schoolIds:['kyonggi','kyonggi','unknown',null],token:'discard'});
    const storage={getItem:()=>raw,setItem:(key:string,value:string)=>{expect(key).toBe(SAVE_KEY);raw=value;}};
    const saved=readSaves(storage,data.schools);expect([...saved]).toEqual(['kyonggi']);
    expect(writeSaves(storage,saved)).toBe(true);expect(JSON.parse(raw)).toEqual({version:1,schoolIds:['kyonggi']});
    raw='broken';expect(readSaves(storage,data.schools).size).toBe(0);
    raw=JSON.stringify({version:2,schoolIds:['kyonggi']});expect(readSaves(storage,data.schools).size).toBe(0);
  });
  it('fails safely when browser storage is unavailable',()=>{
    const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
    expect(readSaves(denied,data.schools).size).toBe(0);expect(writeSaves(denied,new Set(['kyonggi']))).toBe(false);
  });
});
