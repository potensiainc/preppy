"""Validate the authorized Library archive and retain its exact public research records."""
from pathlib import Path
import zipfile,json,hashlib
root=Path(__file__).resolve().parents[3]
archive=root/'test-results/research-transfer/preppy-commute-research-2026-10-15.zip'
dest=root/'data/research/commute/2026-10-15';dest.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    prefix='preppy-commute-research-2026-10-15/'
    manifest=json.loads(z.read(prefix+'manifest.json'))
    for entry in manifest['files']:
        raw=z.read(prefix+entry['name'])
        assert len(raw)==entry['bytes'] and hashlib.sha256(raw).hexdigest()==entry['sha256'],entry['name']
    for name in z.namelist():
        relative=Path(name.removeprefix(prefix))
        assert name.startswith(prefix) and len(relative.parts)==1 and not relative.is_absolute()
        (dest/relative).write_bytes(z.read(name))
metadata={'library_file_id':'libfile_d27f96e991e081918e3cb8e765889609','file_id':'file_000000007b1481fb845afd9beb59265e','version':0,'file_name':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'materialized_locally':True,'reuploaded':False}
(dest/'library-provenance.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
d=json.loads((root/'public/commute/data.json').read_text(encoding='utf8'))
schools=json.loads((dest/'schools.json').read_text(encoding='utf8'))
assert {s['school_id'] for s in schools}=={s['id'] for s in d['schools']}
assert len(schools)==38
print(json.dumps(metadata));print('PASS: archive CRC, every manifest hash and exact 38-school coverage')
