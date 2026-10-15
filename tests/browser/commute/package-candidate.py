"""Package exact static candidate bytes and local build identity; not an OCI image."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
root=Path(__file__).resolve().parents[3]
out=root/'test-results';out.mkdir(exist_ok=True)
files=sorted((root/'public/commute').rglob('*'))
files=[p for p in files if p.is_file()]
build_id=(root/'.next/BUILD_ID').read_text().strip()
manifest={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'nextBuildId':build_id,'kind':'schoolmap-static-build-assets','ociImage':False,'files':[{ 'path':p.relative_to(root).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
package=out/'schoolmap-candidate.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for p in files:
        info=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,10,15,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,p.read_bytes())
    info=zipfile.ZipInfo('candidate-manifest.json',date_time=(2026,10,15,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
    archive.writestr(info,json.dumps(manifest,sort_keys=True,indent=2).encode())
digest=hashlib.sha256(package.read_bytes()).hexdigest()
(out/'schoolmap-candidate.sha256').write_text(digest+'  schoolmap-candidate.zip\n')
(out/'schoolmap-candidate-manifest.json').write_text(json.dumps(manifest,indent=2))
with zipfile.ZipFile(out/'schoolmap-review-artifacts.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
    for folder in [out/'schoolmap',out/'schoolmap-identities']:
        for p in sorted(folder.rglob('*')):
            if p.is_file():archive.write(p,p.relative_to(out).as_posix())
    archive.write(out/'schoolmap-build.log','schoolmap-build.log')
    if (out/'schoolmap-browser.log').exists():archive.write(out/'schoolmap-browser.log','schoolmap-browser.log')
    if (out/'schoolmap-unit.log').exists():archive.write(out/'schoolmap-unit.log','schoolmap-unit.log')
print(json.dumps({'package':str(package),'sha256':digest,'buildId':build_id,'reviewArtifacts':str(out/'schoolmap-review-artifacts.zip')}))
