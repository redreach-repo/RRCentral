# Frontend (GitHub Pages)

Static UI for RED REACH Central. Talks to Google Apps Script via a hidden iframe + `postMessage` (CORS-safe).

## Files

- `index.html` — shell + login
- `config.js` — `scriptUrl` + `apiToken` (do not commit secrets to a public repo without rotating)
- `js/api.js` — API bridge
- `js/boot.js` — login → `getBootstrap` → load app
- `js/app.js` — main UI (synced from `appscript/JavaScript.html`)

## Sync UI from Apps Script source

After editing `appscript/JavaScript.html` or `Stylesheet.html`:

```bash
cd ..
python3 <<'PY'
from pathlib import Path
root = Path('appscript')
css = (root/'Stylesheet.html').read_text()
if '<style>' in css:
    css = css.split('<style>',1)[1].rsplit('</style>',1)[0]
Path('web/css/app.css').write_text(css.strip()+'\n')
js = (root/'JavaScript.html').read_text()
if '<script>' in js:
    js = js.split('<script>',1)[1].rsplit('</script>',1)[0]
# Ensure RRApi fallback exists (already in appscript copy)
Path('web/js/app.js').write_text(js.strip()+'\n')
Path('web/js/app.body.js').write_text(js.strip()+'\n')
print('synced')
PY
```
