/** Inline HighMast token CSS for axe colour-contrast in happy-dom. */

export const TOKEN_STYLE = `
:root, [data-theme="light"] {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f7f4f1;
  --text: #1a1a1a;
  --text-muted: #6e6e6e;
  --primary: #c8321a;
  --on-primary: #ffffff;
  --primary-text: #c8321a;
  --accent: #e8872a;
  --accent-text: #a9540a;
  --on-accent: #1a1a1a;
  --focus-ring: #c8321a;
  --border: rgba(26, 26, 26, 0.12);
  --danger: #b42318;
  --success: #1f7a4d;
  --warn: #a15c00;
  --info: #175cd3;
  --radius: 10px;
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141414;
  --surface: #1a1a1a;
  --text: #f7f4f1;
  --text-muted: #b8b2ac;
  --primary: #c8321a;
  --on-primary: #ffffff;
  --primary-text: #f0654a;
  --accent: #e8872a;
  --accent-text: #e8872a;
  --on-accent: #1a1a1a;
  --focus-ring: #e8872a;
  --border: rgba(247, 244, 241, 0.12);
  --danger: #f07178;
  --success: #3ecf8e;
  --warn: #e6b450;
  --info: #7ab7ff;
}
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
}
a.rr-skip-link {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 10050;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--text);
  color: var(--bg);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
}
button, input, select, textarea {
  font: inherit;
}
button:focus-visible, input:focus-visible, a:focus-visible, select:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.primary-btn {
  min-height: 44px;
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
  cursor: pointer;
}
.field {
  display: grid;
  gap: 6px;
  text-align: left;
  margin-bottom: 12px;
}
.field input, .field select, .field textarea {
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.muted { color: var(--text-muted); }
.error {
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}
.sheet {
  width: 210mm;
  max-width: 100%;
  min-height: 120px;
  background: #ffffff;
  color: #1a1a1a;
  padding: 24px;
  border: 1px solid #ddd;
}
`

export type ThemeMode = 'light' | 'dark'
