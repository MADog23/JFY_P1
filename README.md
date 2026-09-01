# Just For You Alterations — Digital Ticket (Phase 1)

Internal ticketing system for Just For You Alterations (Mt Juliet, TN), replacing paper
intake/work tickets. Built with **Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL**,
styled with Tailwind, deployed on **Railway**.

## What this covers (Phase 1 scope)

- **Intake tickets**: employees capture client/pickup-contact identity and every item in
  an order (garment type, description, desired alterations). Locked after creation —
  only a manager can edit intake-level fields afterward.
- **Working profiles**: notes and measurements per item, open to employees and managers
  for the life of the item.
- **Item lifecycle**: Not started → In progress → Completed (locked) → Picked up. Only a
  manager can reopen a completed item or authorize pickup, including **partial pickup**
  of individual items.
- **Order sealing**: once every item on an order is completed, the order auto-seals
  (read-only) until a manager reopens an item.
- **Public client tracking link**: a no-login, read-only page showing order/item status
  only — see "Client-view privacy" below for exactly what is and isn't shown.
- **Full audit trail**: every change anywhere in the system is attributed to the
  employee or manager who made it, with a timestamp.
- **Employee PIN login** (shared phones/tablets) vs. **manager email+password login**,
  enforced by middleware.
- **Manager tools**: edit any part of any ticket, manage employee PINs and manager
  accounts, manage the garment/alteration option lists, and a basic analytics page.
- **Photo capture placeholder**: the UI and data model support photos now; actual file
  storage is intentionally not wired up yet (see `lib/images.ts` for how to connect it).

## Explicit assumptions / product decisions made along the way

These were either your direct answers or, where something was still open, the most
conservative/self-reliant choice — flag anything you want changed:

- **Employee PIN management**: handled by managers from inside the app (Staff page),
  not a separate admin tool.
- **Client tracking link**: never expires on its own; a manager can manually rotate it
  from the order page as a safety valve if a link is ever shared somewhere it shouldn't be.
- **Garment/alteration taxonomy**: seeded with standard formalwear categories (hem, take
  in, let out, bustle, strap adjustment, etc.), editable anytime from Staff → Garment options.
- **Pricing**: not tracked in Phase 1. Payment *status* (Unpaid / Deposit paid / Paid) is
  tracked, with no card processing involved.
- **Client-view redaction**: the public tracking page shows only order number, due date,
  overall status, and each item's garment type + status (+ pickup date if applicable).
  Everything else — contact details, internal notes, measurements, staff names (including
  who picked an item up), payment status, and the audit log — is withheld by design. If
  you want to loosen this, it's a single, well-commented function: `lib/client-view.ts`.
- **Multi-manager support**: any manager can create additional manager accounts from the
  Staff page (useful once there's more than one manager/owner).

## Project structure

```
app/                      Next.js App Router pages
  login/                   Employee PIN + manager credential login
  employee/                Employee dashboard, new-intake form, order working profile
  manager/                 Manager dashboard, order profile, staff, taxonomy, analytics
  track/[token]/           Public read-only client tracking page
actions/                  Server actions (all mutations + audit logging live here)
lib/                      DB client, auth/session, audit log, order numbering,
                           order-status lifecycle, client-view redaction
components/               Shared UI (forms, item cards, order profile, nav, etc.)
prisma/schema.prisma      Full data model
prisma/migrations/        Hand-authored initial migration (ready for `migrate deploy`)
prisma/seed.ts            Creates first manager login + default taxonomy
```

## Permissions at a glance

| Action                                           | Employee | Manager |
|---------------------------------------------------|:--------:|:-------:|
| Create intake ticket                               |    Yes   |   Yes   |
| Edit client identity / item list after creation     |    No    |   Yes   |
| Add notes & measurements                            |    Yes   |   Yes   |
| Start / complete an item                            |    Yes   |   Yes   |
| Reopen a completed item                             |    No    |   Yes   |
| Authorize item pickup                                |    No    |   Yes   |
| Manage employee PINs / manager accounts              |    No    |   Yes   |
| Manage garment/alteration options                    |    No    |   Yes   |
| View analytics                                       |    No    |   Yes   |

## Running locally

1. `npm install`
2. Start a local Postgres (or point `DATABASE_URL` at any Postgres instance).
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`
   (`openssl rand -base64 32` for the secret).
4. `npx prisma migrate deploy` (applies the included initial migration)
5. `npm run db:seed` (creates the first manager login — check the console output for
   the generated email/password, or set `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`
   in `.env` first)
6. `npm run dev` and visit `http://localhost:3000`

## Deploying on Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, select this repo.
3. **Add a PostgreSQL plugin** to the same Railway project — Railway will automatically
   inject `DATABASE_URL` into your app service.
4. In your app service's **Variables**, add:
   - `SESSION_SECRET` — a long random string (`openssl rand -base64 32`)
   - `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` — only needed for the one-time seed
5. Deploy. The `start` script runs `prisma migrate deploy` automatically before booting
   Next.js, so your first deploy also creates all tables.
6. Seed the first manager account once, using Railway's CLI:
   ```
   railway run npm run db:seed
   ```
7. Log in as that manager. There's no in-app "change my own password" yet — for now,
   create a second manager account with the credentials you want and deactivate the
   seeded one from the Staff page.
8. Add employees and their PINs from **Staff** in the manager app.

Because `start` runs migrations automatically, future schema changes just need a new
migration file committed (`npx prisma migrate dev --name your_change` locally against a
dev database) — Railway will apply it on the next deploy.

## Extending later (by design, not by accident)

- **Real photo storage**: see the comment block in `lib/images.ts` — the schema and UI
  are already shaped for it, only a storage client and one field need to change.
- **Pricing**: `Order.paymentStatus` already exists; adding a `priceCents` field to
  `Order` or `OrderItem` is a small, additive migration.
- **SMS/email notifications**: intentionally out of scope — the brief was explicit that
  this phase is about giving clients *access* to status, not pushing them updates.
- **Multi-location**: the schema has no location/store concept yet; if a second location
  is ever added, that's a new `Location` model plus a foreign key on `Order` and `User`.
