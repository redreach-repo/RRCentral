# Docs: start here

Plain guide to what is in this folder. Nothing here changes the app.

## Setting up and checking live
| Doc | Use it for |
|---|---|
| [setup-status.md](setup-status.md) | Admin, System check: which database updates, functions and secrets are still owed |
| [LIVE_TEST.md](LIVE_TEST.md) | Step by step checks on the live site after a deploy |
| [STAGING.md](STAGING.md) | The staging copy of the database |
| [BACKUPS.md](BACKUPS.md) | Backups and restore |
| [MIGRATIONS.md](MIGRATIONS.md) | What each database update does |
| [PRODUCTION_DATA_CHECK.md](PRODUCTION_DATA_CHECK.md) | The 23 Oct data check |
| [TEAM_SETUP.md](TEAM_SETUP.md) | Adding team members |
| [SECURITY.md](SECURITY.md) | Security headers and keys |
| [modules/hr-payroll-access.md](modules/hr-payroll-access.md) | Who can see HR, payroll, API keys, webhooks and approvals |

## Features (one doc each)
Client side: [client-portal.md](client-portal.md), [client-health.md](client-health.md), [client-reports.md](client-reports.md), [client-updates.md](client-updates.md), [client-data-export.md](client-data-export.md), [service-agreement.md](service-agreement.md), [legal-documents.md](legal-documents.md).
Sales and leads: [lead-intake.md](lead-intake.md), [lead-handling-runbook.md](lead-handling-runbook.md), [division-quotations.md](division-quotations.md), [hubspot-sync.md](hubspot-sync.md), [payment-reminders.md](payment-reminders.md), [contract-invoices.md](contract-invoices.md), [mrr.md](mrr.md).
Daily running: [daily-digest.md](daily-digest.md), [watchdog.md](watchdog.md), [usage-import.md](usage-import.md), [whatsapp-tickets.md](whatsapp-tickets.md), [ai-help.md](ai-help.md), [event-outbox.md](event-outbox.md), [theme-studio.md](theme-studio.md), [saas-billing.md](saas-billing.md).
Integrations: [worshiphub-integration.md](worshiphub-integration.md), [zoho-crm-integration.md](zoho-crm-integration.md), [zoho-field-mapping.md](zoho-field-mapping.md), [wanders-tour-ops-mapping.md](wanders-tour-ops-mapping.md).
Newer modules: the [modules/](modules/) folder, one doc per module.

## Plans, decisions and history
Current: [REMAINING.md](REMAINING.md), [RUN_STATE.md](RUN_STATE.md), [DECISIONS.md](DECISIONS.md), [QUESTIONS.md](QUESTIONS.md), [COMPLIANCE_NOTES.md](COMPLIANCE_NOTES.md), [SPEC_POINTER.md](SPEC_POINTER.md).
History (kept for reference, may be out of date): [FULL-BUILD-HANDOVER.md](FULL-BUILD-HANDOVER.md), [STATUS.md](STATUS.md), [AUDIT.md](AUDIT.md), [GAP_PLAN.md](GAP_PLAN.md), [MODULE_BUILD_PLAN.md](MODULE_BUILD_PLAN.md), [RUN_PLAN.md](RUN_PLAN.md), [FEATURE_SLICES_M6_M12.md](FEATURE_SLICES_M6_M12.md), [M3_CRM_UNIFY.md](M3_CRM_UNIFY.md), [M3A_DEMO.md](M3A_DEMO.md), [M4_MAIL_CALENDAR.md](M4_MAIL_CALENDAR.md), [M5_CONTRACTS_ESIGN.md](M5_CONTRACTS_ESIGN.md), [PRODUCTION_CUTOVER.md](PRODUCTION_CUTOVER.md), [BRAND_AUDIT.md](BRAND_AUDIT.md), [rr-central-modules.md](rr-central-modules.md).

## Housekeeping
- Merged branches: Actions, "Delete merged branches". Run it with "Only list" first; it never touches main, `build/*`, branches with an open PR, or anything changed in the last 2 days.
