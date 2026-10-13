"""Build the Edge store package with minimal permissions, leaving dev source intact."""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'bnu-etd-extension'
output = ROOT / 'output' / 'edge-store'
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text())
manifest['permissions'] = ['activeTab', 'storage']
manifest['host_permissions'] = ['https://api.github.com/*', 'https://etdlib.bnu.edu.cn/*']
for entry in manifest['content_scripts']:
    entry['matches'] = [pattern for pattern in entry['matches'] if not pattern.startswith('file:')]

# The current export downloads via a document Blob link. The old, unused
# downloads-API handler is not included in the store build.
worker = (source / 'service-worker.js').read_text()
worker = worker.replace("const DOWNLOAD_MESSAGE = 'download-pdf';\n", '')
start = worker.index('  if (message.type === DOWNLOAD_MESSAGE) {')
end = worker.index('\n});', start)
worker = worker[:start] + worker[end:]
archive = output / f'crow-pdf-edge-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(source.rglob('*')):
        if not path.is_file() or path.name.startswith('.') or path.name == 'icon-source.png':
            continue
        name = path.relative_to(source).as_posix()
        if name == 'manifest.json':
            content = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
        elif name == 'service-worker.js':
            content = worker.encode()
        else:
            content = path.read_bytes()
        bundle.writestr(name, content)
print(archive)
