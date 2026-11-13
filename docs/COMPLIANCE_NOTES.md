# Compliance notes

Findings from official sources go here **before** shipping tax, payroll, e-sign, or e-invoice features (Master Spec §0 rule 8).

| Topic | Status | Source checked | Date | Notes |
|-------|--------|----------------|------|-------|
| UAE electronic signatures / trust services | not started | — | — | Required before M5 claims |
| UAE WPS SIF format | not started | — | — | Required before M8 bank file |
| UAE end-of-service gratuity | not started | — | — | Required before M8 formula |
| UAE VAT rates / return layout | not started | — | — | Partial product VAT today; verify before M7 return |
| UAE corporate tax | not started | — | — | M7+ |
| UAE e-invoicing timeline / format | not started | — | — | Design invoice model for accredited provider |
| Google restricted Gmail scopes assessment | started | Google API Services User Data Policy; Gmail API scopes | 13 Nov 2026 | M4 slice 1 kickoff — candidate scopes: `gmail.send`, `gmail.readonly`, Calendar read/write; **no** Gmail implementation until assessment concludes |
| Data residency (UAE hosting options) | not started | — | — | Decide before first external customer / M13 |

Do not rely on model memory for legal or tax rules.
