import { PRODUCT } from '../lib/product'
import type { ThemeMode } from './tokenStyles'

function shellChrome(theme: ThemeMode, mainHtml: string, pageName: string): string {
  return `
<div data-theme="${theme}" data-surface="home" style="background:var(--bg);color:var(--text);min-height:100vh">
  <a href="#main-content" class="rr-skip-link">Skip to main content</a>
  <div style="display:flex;min-height:100vh">
    <aside aria-label="Main navigation" style="width:220px;padding:16px;background:var(--surface);border-inline-end:1px solid var(--border)">
      <p style="margin:0 0 12px;font-weight:650">Acme Trading</p>
      <nav aria-label="Main">
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:4px">
          <li><a href="/app" style="color:var(--primary-text)">Home</a></li>
          <li><a href="/crm" style="color:var(--text)">Pipeline</a></li>
          <li><a href="/quotations" style="color:var(--text)">Quotes</a></li>
        </ul>
      </nav>
      <footer style="margin-top:24px">
        <p class="muted" style="font-size:12px;margin:0">${PRODUCT.name}</p>
      </footer>
    </aside>
    <div style="flex:1;display:flex;flex-direction:column">
      <header style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
        <p style="margin:0;font-weight:650" aria-label="${pageName}">${pageName}</p>
        <button type="button" class="primary-btn" aria-label="Colour mode ${theme}. Click to change." style="margin-inline-start:auto;min-height:44px">
          Theme
        </button>
      </header>
      <main id="main-content" tabindex="-1" style="padding:20px;flex:1">
        ${mainHtml}
      </main>
    </div>
  </div>
</div>`
}

/** Sign-in page chrome (always dark per brand rules). */
export function signInFixture(): string {
  return `
<div data-theme="dark" data-surface="sign-in" class="page" style="min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);padding:24px">
  <div class="card" style="width:min(400px,100%);text-align:center">
    <img src="/brand/highmast/A-h-mast/A_stacked_reverse.png" alt="${PRODUCT.name}" height="88" width="220" style="margin:0 auto 12px;display:block" />
    <p class="muted" style="margin:0 0 16px;font-size:13px">${PRODUCT.endorsement}</p>
    <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${PRODUCT.name}</h1>
    <p class="muted" style="margin:0 0 20px;font-size:14px">${PRODUCT.tagline}</p>
    <form aria-describedby="login-error">
      <div class="field">
        <label for="login-email">Email</label>
        <input id="login-email" name="email" type="email" placeholder="you@company.com" autocomplete="username" required aria-describedby="login-error" />
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required minlength="8" aria-describedby="login-error" />
      </div>
      <p id="login-error" class="error" role="alert" hidden>
        <span aria-hidden="true">⚠</span>
        <span>Wrong email or password</span>
      </p>
      <button type="submit" class="primary-btn" style="width:100%">Sign in</button>
    </form>
  </div>
</div>`
}

export function homeFixture(theme: ThemeMode): string {
  return shellChrome(
    theme,
    `
    <section aria-label="Today">
      <p class="muted">Saturday · Acme Trading</p>
      <h1 style="margin:8px 0;font-size:28px">Nothing due for you today</h1>
      <p class="muted">Open My Day when follow-ups land.</p>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <a class="primary-btn" href="/crm?follow=Due&owner=me" style="text-decoration:none;display:inline-flex;align-items:center">Open My Day</a>
        <a href="/deals?view=board" style="color:var(--primary-text);min-height:44px;display:inline-flex;align-items:center">Pipeline</a>
      </div>
    </section>
    <section aria-label="Alerts" style="margin-top:24px">
      <h2 style="font-size:16px">Needs attention</h2>
      <p class="status"><span aria-hidden="true">●</span><span>Open quotes · 2 waiting</span></p>
    </section>
    `,
    'Home',
  )
}

export function listFixture(theme: ThemeMode): string {
  return shellChrome(
    theme,
    `
    <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
      <div>
        <h1 style="margin:0;font-size:22px">Quotes</h1>
        <p class="muted" style="margin:4px 0 0">Open and sent quotations</p>
      </div>
      <button type="button" class="primary-btn">New quote</button>
    </header>
    <table style="width:100%;border-collapse:collapse">
      <caption class="muted" style="text-align:start;padding-bottom:8px">Three recent quotes</caption>
      <thead>
        <tr style="text-align:start;border-bottom:1px solid var(--border)">
          <th scope="col" style="padding:8px">Reference</th>
          <th scope="col" style="padding:8px">Company</th>
          <th scope="col" style="padding:8px">Status</th>
          <th scope="col" style="padding:8px">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px"><a href="/quotations/1" style="color:var(--primary-text)">RR-03-26014</a></td>
          <td style="padding:8px">Clinic LLC</td>
          <td style="padding:8px"><span class="status"><span aria-hidden="true">●</span><span>Sent</span></span></td>
          <td style="padding:8px">AED 12,400</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px"><a href="/quotations/2" style="color:var(--primary-text)">RR-03-26015</a></td>
          <td style="padding:8px">Harbor Co</td>
          <td style="padding:8px"><span class="status"><span aria-hidden="true">●</span><span>Draft</span></span></td>
          <td style="padding:8px">AED 3,200</td>
        </tr>
      </tbody>
    </table>
    `,
    'Quotes',
  )
}

export function formFixture(theme: ThemeMode): string {
  return shellChrome(
    theme,
    `
    <h1 style="margin:0 0 8px;font-size:22px">New account</h1>
    <p class="muted" style="margin:0 0 16px">Required fields are marked</p>
    <form aria-describedby="account-form-error">
      <div class="field">
        <label for="account-name">Company name <span aria-hidden="true">*</span></label>
        <input id="account-name" name="name" required aria-required="true" aria-invalid="true" aria-describedby="account-name-error account-form-error" />
        <p id="account-name-error" class="error">
          <span aria-hidden="true">⚠</span>
          <span>Enter a company name</span>
        </p>
      </div>
      <div class="field">
        <label for="account-email">Billing email</label>
        <input id="account-email" name="email" type="email" aria-describedby="account-form-error" />
      </div>
      <div class="field">
        <label for="account-stage">Pipeline stage</label>
        <select id="account-stage" name="stage" aria-describedby="account-form-error">
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="won">Won</option>
        </select>
      </div>
      <p id="account-form-error" class="error" role="alert">
        <span aria-hidden="true">⚠</span>
        <span>Fix the highlighted fields before saving</span>
      </p>
      <button type="submit" class="primary-btn">Save account</button>
    </form>
    `,
    'New account',
  )
}

/** Document / PDF viewer chrome: toolbar + white sheet (print area stays light). */
export function pdfFixture(theme: ThemeMode): string {
  return shellChrome(
    theme,
    `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px" role="toolbar" aria-label="Document actions">
      <button type="button" class="primary-btn">Download PDF</button>
      <button type="button" class="primary-btn" style="background:transparent;color:var(--text);border:1px solid var(--border)">Print</button>
      <button type="button" class="primary-btn" style="background:transparent;color:var(--text);border:1px solid var(--border)" aria-label="Light document view">Light view</button>
      <button type="button" class="primary-btn" style="background:transparent;color:var(--text);border:1px solid var(--border)" aria-label="Dark document view">Dark view</button>
    </div>
    <article class="sheet" aria-label="Quotation RR-03-26014">
      <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a">Quotation RR-03-26014</h1>
      <p style="margin:0;color:#6e6e6e">Clinic LLC · AED 12,400</p>
      <table style="width:100%;margin-top:16px;border-collapse:collapse;color:#1a1a1a">
        <thead>
          <tr>
            <th scope="col" style="text-align:start;border-bottom:1px solid #ddd;padding:6px">Item</th>
            <th scope="col" style="text-align:end;border-bottom:1px solid #ddd;padding:6px">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px">Support retainer</td>
            <td style="padding:6px;text-align:end">AED 12,400</td>
          </tr>
        </tbody>
      </table>
    </article>
    `,
    'Quote',
  )
}
