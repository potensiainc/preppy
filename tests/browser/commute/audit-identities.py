"""Read-only identity evidence audit; never writes account state or invents UUIDs."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json,re,urllib.request,html,hashlib
root=Path(__file__).resolve().parents[3]
data=json.loads((root/'public/commute/data.json').read_text(encoding='utf8'))
seed=json.loads((root/'data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json').read_text(encoding='utf8'))
rows=seed['institutions']
out=root/'test-results/schoolmap-identities';out.mkdir(parents=True,exist_ok=True)
def normalize(s):return re.sub(r'\s+','',s).replace('서울특별시','서울').replace('서울시','서울')
def audit(s):
    # Reviewed abbreviations: these require exact address and rendered official-name checks too.
    aliases={'sangmyung-ae':'상명대학교사범대학부속초등학교','ewha':'이화여자대학교사범대학부속초등학교','cau':'중앙대학교사범대학부속초등학교','hongik':'홍익대학교사범대학부속초등학교'}
    name=aliases.get(s['id'],re.sub('초$','초등학교',s['name']))
    candidates=[r for r in rows if r['institution_type']=='PRIVATE_ELEMENTARY' and r['canonical_name_ko']==name and r['city_district']==s['district']]
    result={'schoolId':s['id'],'commuteName':s['name'],'commuteAddress':s['address'],'status':'unresolved','candidates':[{'slug':r['slug'],'name':r['canonical_name_ko'],'address':r['address']} for r in candidates]}
    if len(candidates)!=1:return result
    candidate=candidates[0];url='https://preppy-web-production.up.railway.app/institutions/'+candidate['slug']
    result['publicPageUrl']=url
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'PREPPY read-only identity audit'})
        body=urllib.request.urlopen(request,timeout=25).read()
        (out/(s['id']+'.html')).write_bytes(body)
        text=html.unescape(body.decode('utf8'));plain=re.sub('<[^>]+>',' ',text)
        ids=set(re.findall(r'institutionId\\?"\s*:\\?"([0-9a-f-]{36})',text))
        result['pageSha256']=hashlib.sha256(body).hexdigest()
        result['namePresent']=name in plain
        result['seedAddressPresent']=normalize(candidate['address']) in normalize(plain)
        result['commuteAddressMatchesSeed']=normalize(candidate['address'])==normalize(s['address'])
        if len(ids)==1 and result['namePresent'] and result['seedAddressPresent'] and result['commuteAddressMatchesSeed']:
            result.update(status='public_identity_matched',institutionId=ids.pop(),officialName=name)
        else:result['reason']='Exact name/address/one UUID checks did not all match'
    except Exception as e:result['reason']=str(e)
    return result
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(audit,data['schools']))
(out/'audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'matched':sum(r['status']=='public_identity_matched' for r in results),'unresolved':[r['schoolId'] for r in results if r['status']!='public_identity_matched'],'audit':str(out/'audit.json')},ensure_ascii=False))
