"""Prepare one native build without changing the source manifest/resources."""
from pathlib import Path
import shutil,sys
root=Path(__file__).resolve().parents[1]
variant,output=sys.argv[1],Path(sys.argv[2])
shutil.copytree(root/'app/src/main/res',output/'res',dirs_exist_ok=True)
manifest=(root/'app/src/main/AndroidManifest.xml').read_text()
if variant=='qa':
    manifest=manifest.replace('package="gy.cleanthings.app"','package="gy.cleanthings.app.qa"')
    strings=output/'res/values/strings.xml'
    strings.write_text(strings.read_text().replace('>Clean Things<','>Clean Things QA<'))
(output/'AndroidManifest.xml').write_text(manifest)
