#!/usr/bin/env python3
"""Create a clean source ZIP from an explicit eligible tree, not build folders."""
from pathlib import Path
import os,shutil,subprocess,sys,tempfile,zipfile
root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'dist/CleanThings-GitHub-Source-v0.6.9.zip'
excluded={'.git','node_modules','build','dist','signing','test-results','__pycache__'}
with tempfile.TemporaryDirectory(prefix='cleanthings-package-') as work:
 stage=Path(work)/'CleanThings'
 for folder,dirs,files in os.walk(root):
  dirs[:]=[d for d in dirs if d not in excluded]
  for name in files:
   p=Path(folder,name);relative=p.relative_to(root)
   if p.suffix.lower() in {'.apk','.idsig','.jks','.keystore','.pem','.p12','.pfx','.pyc'} or name.startswith('.env') or relative.as_posix()=='app/src/main/assets/config.js':continue
   target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 shutil.copy2(stage/'app/src/main/assets/config.example.js',stage/'app/src/main/assets/config.js')
 subprocess.run([sys.executable,str(stage/'scripts/check_source_package.py'),'--package'],check=True)
 output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(stage.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(stage))
 with zipfile.ZipFile(output) as z:
  assert z.testzip() is None
 print(output)
