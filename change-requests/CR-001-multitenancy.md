---
title: "Multi-tenancy: Organizations, Users, Auth, API Keys"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Add full multi-tenancy support to Sifter. Every resource (extractions, folders, documents, aggregations) belongs to an Organization. Users belong to organizations with roles. Authentication is via JWT (login/register) and API Keys (for programmatic access).

## Changes to product/

### product/features/auth.md (NEW)

Create this file describing:

**Authentication feature** — Users can register, log in, and receive a JWT token. The token is used for all browser-based API calls (Bearer header). Users have: `id`, `email`, `password_hash`, `full_name`, `created_at`.

**API Key management** — Users can create named API keys scoped to their organization. API keys are used for machine-to-machine access (SDK, integrations). Keys have: `id`, `name`, `key_hash`, `key_prefix` (shown in UI), `organization_id`, `created_by`, `created_at`, `last_used_at`, `is_active`. Keys are shown in full only once at creation.

**Organizations** — An organization is the top-level tenant. Users belong to one or more organizations with a role (`owner`, `admin`, `member`). On registration, a personal organization is created automatically. Users can create additional organizations and invite other users.

Entities: `Organization` (`id`, `name`, `slug`, `created_at`), `OrganizationMember` (`org_id`, `user_id`, `role`, `joined_at`).

**Frontend pages**: Login, Register, API Keys management page, Organization settings page.

### product/features/extraction.md (CHANGED)

Add: All extractions are scoped to an organization. Extraction create/list/delete requires auth (JWT or API key). Add `organization_id` field to the extraction entity description.

### product/features/query.md (CHANGED)

Add: All query and aggregation endpoints require auth (JWT or API key). Results are scoped to the caller's organization.

### product/features/chat.md (CHANGED)

Add: Chat endpoint requires auth. Scoped to caller's organization.

### product/features/sdk.md (CHANGED)

Add: SDK `Sifter(api_key="sk-...")` — API key is passed at client construction. Add section on how to create API keys from the UI and use them in the SDK.

## Changes to system/

### system/entities.md (CHANGED)

Add entities:
- `User`: `id`, `email`, `password_hash`, `full_name`, `created_at`
- `Organization`: `id`, `name`, `slug`, `created_at`
- `OrganizationMember`: `org_id`, `user_id`, `role` (owner/admin/member), `joined_at`
- `APIKey`: `id`, `name`, `key_hash`, `key_prefix`, `organization_id`, `created_by`, `created_at`, `last_used_at`, `is_active`

Update all existing entities (Extraction, Folder, Document, Aggregation) to include `organization_id`.

### system/api.md (CHANGED)

Add auth endpoints:
- `POST /api/auth/register` — register user, returns JWT
- `POST /api/auth/login` — login, returns JWT
- `GET /api/auth/me` — current user info

Add API key endpoints:
- `GET /api/keys` — list API keys for current org
- `POST /api/keys` — create API key, returns full key once
- `DELETE /api/keys/{key_id}` — revoke key

Add organization endpoints:
- `GET /api/orgs` — list user's organizations
- `POST /api/orgs` — create organization
- `GET /api/orgs/{org_id}/members` — list members
- `POST /api/orgs/{org_id}/members` — invite member

Add auth requirement to all existing endpoints: JWT Bearer token or `X-API-Key` header. All resources filtered by `organization_id` from the authenticated principal.

### system/architecture.md (CHANGED)

Add:
- Auth middleware: FastAPI dependency `get_current_principal()` that accepts both JWT and API Key. Returns `Principal(user_id, org_id, via)`.
- Password hashing: `passlib` with bcrypt.
- JWT: `python-jose` with HS256, configurable secret and expiry.
- API Key format: `sk-<base58(32 random bytes)>` — hash stored in DB, prefix stored for display.
- All MongoDB queries include `{"organization_id": principal.org_id}` filter.

### system/frontend.md (CHANGED)

Add:
- Login and Register pages (unauthenticated routes)
- Auth context: store JWT in localStorage, inject as Bearer header in all fetch calls
- Redirect to `/login` when 401 received
- API Keys settings page: list keys with prefix + creation date, create new key (show full key in modal once), revoke key
- Organization switcher in navbar (if user belongs to multiple orgs)
