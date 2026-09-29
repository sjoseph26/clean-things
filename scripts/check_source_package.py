#!/usr/bin/env python3
"""Validate current source; --package also rejects generated/private files."""
import argparse, base64, json, os, re, sys
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
parser.add_argument('--package',action='store_true')
args=parser.parse_args();root=args.root.resolve();errors=[]
excluded={'.git','node_modules','build','dist','signing','test-results','__pycache__'}
required=['README.md','CHANGELOG.md','package.json','package-lock.json','.gitignore','.github/workflows/verify.yml','build-apk.sh','app/src/main/assets/config.example.js','app/src/main/assets/app.js','app/src/main/assets/backend.js','app/src/main/assets/core.js','app/src/main/assets/styles.css','app/src/main/assets/index.html','app/src/main/AndroidManifest.xml','app/src/main/java/gy/cleanthings/app/MainActivity.java','scripts/configure.py','scripts/prepare_android.py','scripts/package_source.py','docs/GITHUB.md','docs/TEST-PLAN.md','docs/TRACEABILITY.md','docs/RELEASE-STATUS.md','docs/CONTRIBUTIONS.md','docs/evaluation/evaluator-1.md','docs/evaluation/evaluator-2.md','docs/evaluation/evaluator-3.md','supabase/migrations/202609210001_release_repairs.sql']
required += ['app/src/main/assets/session-store.js', 'app/src/main/java/gy/cleanthings/app/SessionVault.java', 'app/src/main/java/gy/cleanthings/app/SessionCipher.java', 'tests/java/SessionCipherTest.java', 'tests/session-storage.test.cjs']
required += ['supabase/migrations/202609290002_admin_mfa.sql', 'docs/ADMIN-MFA-ROLLOUT.md', 'tests/admin-mfa-database.test.cjs', 'tests/mfa-backend.test.cjs']
for f in required:
 if not (root/f).is_file():errors.append('Missing '+f)
files=[]
for folder,dirs,names in os.walk(root):
 for name in list(dirs):
  if name in excluded:
   if args.package:errors.append('Forbidden directory '+str(Path(folder,name).relative_to(root)))
   dirs.remove(name)
 for name in names:
  p=Path(folder,name);relative=p.relative_to(root)
  if p.suffix.lower() in {'.jks','.keystore','.pem','.p12','.pfx','.pyc','.apk','.idsig'} or name.startswith('.env'):
   errors.append('Private/generated file '+str(relative));continue
  files.append(p)
for p in files:
 if p.suffix not in {'.md','.java','.js','.cjs','.json','.sql','.py','.sh','.yml','.xml','.txt','.tap'}:continue
 text=p.read_text(errors='replace')
 if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',text) or re.search(r'\bsb_secret_[A-Za-z0-9_-]{16,}',text):errors.append('Secret material in '+str(p.relative_to(root)))
 for jwt in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',text):
  try:
   payload=jwt.split('.')[1];decoded=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
   if decoded.get('role')=='service_role':errors.append('Privileged JWT in '+str(p.relative_to(root)))
  except (ValueError,UnicodeError):pass
 if p.suffix=='.md':
  for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',text):
   target=target.strip().split('#')[0]
   if not target or re.match(r'[a-z]+:',target):continue
   resolved=(p.parent/target).resolve()
   if not resolved.is_relative_to(root) or not resolved.exists():errors.append('Broken/outside link '+str(p.relative_to(root))+': '+target)
package=json.loads((root/'package.json').read_text())
version=package['version']
if f'VERSION="{version}"' not in (root/'build-apk.sh').read_text():errors.append('Build/package version mismatch')
for name in ['README.md','docs/LIVE-SETUP.md','docs/TEST-PLAN.md','docs/DEVELOPMENT-NOTE.md','docs/RELEASE-STATUS.md']:
 if version not in (root/name).read_text():errors.append('Version missing in '+name)
for f in re.findall(r'tests/[\w.-]+',package['scripts']['test']):
 if not (root/f).is_file():errors.append('Missing executable test '+f)
if args.package:
 config=(root/'app/src/main/assets/config.js').read_text()
 if re.search(r'https://[a-z0-9-]+\.supabase\.co|sb_publishable_[A-Za-z0-9_-]+',config):errors.append('Source package must use blank demo configuration')
if errors:
 print('\n'.join(errors),file=sys.stderr);sys.exit(1)
print(f'PASS: v{version}; {len(files)} source/evidence files; required files, Markdown links, versions and secret exclusions checked.')
