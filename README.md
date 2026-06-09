# Ahmad Al Abdalla Inter-Branch Transfer System

Internal web application for tracking item movement between Ahmad Al Abdalla branches.

The system records transfers, confirms received quantities, flags mismatches for admin review, and reports the financial impact of branch-to-branch movement.

## Current Product Scope

- Branch management for super admins.
- Item catalog management with unit and price snapshots.
- Multi-line transfers between sender and receiver branches.
- Receiving workflow that compares sent and received quantities.
- Admin resolution workflow for mismatches.
- Dashboard, quantity tracker, and branch/item reporting.
- Super-admin managed user accounts.

## Users And Roles

The app uses Supabase Auth with app-specific profiles in `public.user_profiles`.

- `super_admin`: manages users, branches, items, and admin transfer resolution.
- `branch_manager`: works from one assigned branch and can create or receive transfers scoped to that branch.

There is no public signup flow. Users are created by a super admin, or the first super admin is created through first-time setup.

## Authentication

Users log in with an assigned username. Internally, the app maps the username to a Supabase Auth email using:

```text
username -> username@alabdallah.internal
```

New users can be required to change their temporary password before continuing.

Google Authenticator / TOTP MFA is required before normal app access. The app checks Supabase authenticator assurance level `aal2`, and the database policies also use the JWT `aal` claim for protected data access.

## Security Model

The UI redirects users away from unauthorized pages, but the database is the source of truth.

Security is enforced with:

- Supabase Auth sessions.
- Active user profiles.
- Required MFA.
- Role checks for super-admin actions.
- Supabase Row Level Security on protected tables.
- Database RPC functions for transfer workflows.
- Server-only Supabase service-role usage for admin user management.

Branch and item data can be read by active MFA-verified users. Creating, editing, or deleting branches/items requires an active MFA-verified super admin.

Transfers are branch-scoped. A branch manager can read transfers where their assigned branch is the sender or receiver. Super admins can read and resolve all transfers.

## Transfer Lifecycle

Transfers use these statuses:

- `pending_receipt`: transfer was created and is waiting for receiver confirmation.
- `confirmed`: received quantities matched sent quantities.
- `needs_admin_review`: received quantities did not match sent quantities.
- `admin_resolved`: a super admin resolved the mismatch.
- `cancelled`: a super admin cancelled the transfer.

Core transfer operations are implemented as Supabase RPC functions:

- `create_transfer`
- `receive_transfer`
- `admin_resolve_transfer`

These functions validate active login, MFA, role, branch scope, quantities, and status transitions.

## First-Time Setup

Create the first super admin through `/setup` with `SETUP_SECRET`, or run:

```bash
npm run create:super-admin -- super.admin +96170123456 "ChangeMe123!" "Super Admin"
```

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SETUP_SECRET
```

Disable public signups in the Supabase dashboard. Manager accounts should be created only through the super-admin flow.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run build
npm run lint
```

## Database Notes

The migrations in `supabase/migrations` define user profiles, transfer tables, RPC functions, and RLS policies.

For live Supabase projects, keep RLS enabled and verify that branch/item mutation policies allow only active MFA-verified super admins.
