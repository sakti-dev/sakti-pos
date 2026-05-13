---
id: 6
title: Use Schema Compatibility And Version Gating
date: 2026-05-14
status: accepted
domains: [schema, sync, api, pos]
---

# 6. Use Schema Compatibility And Version Gating

## Context

The POS app and API can run different versions during rollout. Sync and API changes can break older clients if schema changes are assumed to be instantly available everywhere.

## Decision

Treat schema compatibility as an explicit rollout concern.

Local SQLite migrations, API database schema changes, protobuf fields, and sync behavior must be rolled out in an order that keeps older clients functional until they are replaced.

When a change requires coordinated API and app support, gate behavior through explicit compatibility checks or additive schema changes before removing old paths.

## Consequences

Breaking schema assumptions should be documented before implementation.

API schema changes require applying the schema to the database used by the running API. Android-side local schema changes require rebuilding and reinstalling the app before device verification.
