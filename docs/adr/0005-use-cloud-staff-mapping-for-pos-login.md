---
id: 5
title: Use Cloud Staff Mapping For POS Login
date: 2026-05-14
status: accepted
domains: [auth, staff, sync, api]
---

# 5. Use Cloud Staff Mapping For POS Login

## Context

The POS app has two authentication concepts:

- Cloud account session for API access.
- Local POS staff session for permissions, order attribution, and local unlock behavior.

A returning cloud user on a fresh install should not create a new PIN if the cloud user already maps to an existing active staff row.

## Decision

Map cloud users to POS staff with `staff.cloud_user_id`.

After cloud login and outlet selection, the app calls `POST /api/staff/current`. The API resolves or claims the active staff row for the selected merchant when allowed. The app then runs sync and logs in locally with `loginWithCloudStaff(staffId)`.

Owner bootstrap may claim exactly one unclaimed active owner staff row. Ambiguous owner rows and non-owner memberships do not auto-claim staff.

## Consequences

PIN remains a local staff unlock credential, not the cloud login credential.

The API database must contain `staff.cloud_user_id`. After schema changes, the API database used by the running API must be updated with `bun run db:push`.
