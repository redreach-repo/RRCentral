Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: auth user create, DNS, Stripe Tax, live multi-tenant cutover

## What it does

`business_type_packs` map + idempotent `workspace_provision_requests`. Form at `/workspace-setup`. Edge `hm-provision-workspace` (secret or admin JWT) records requests and returns pack_key.

## Alfred

Set `WORKSPACE_PROVISION_SECRET`, apply `20261230220000_workspace_provisioner.sql`, deploy function.
