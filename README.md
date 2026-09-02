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
- **Item lifecycle**: Not started → In progress → Completed (locked) → Picked up. Either
  an employee or a manager can authorize pickup — it's per item, so **partial pickup**
  (some items of an order picked up, others not) and picking up a whole order (every
  item, one at a time) both work the same way for either role. Only a manager can reopen
  a completed item, or **undo an accidental pickup** (puts the item back to completed;
  the original pickup stays visible in the activity log either way).
- **Order sealing**: once every item on an order is completed, the order auto-seals
  (read-only) until a manager reopens an item.
- **Order search**: the order list (both employee and manager) can be filtered by a
  free-text search across everything captured about the client at intake — name, phone,
  email, pickup contact name/phone — plus the order number itself, combined with a
  created-date range. Available to both roles, same as the list itself; stacks with the
  existing status tabs (In progress / Ready for pickup / Picked up / All), and everything
  lives in the URL's query string so a search is a shareable/bookmarkable link.
- **Public client tracking link**: a no-login, read-only page showing order/item status
  only — see "Client-view privacy" below for exactly what is and isn't shown.
- **Client order lookup**: a fallback for clients who don't have their tracking link
  handy — they enter their order number + phone number at `/track` and, on a match, land
  on the same tracking page above. See "Client order lookup" below for the full design.
- **Full audit trail**: every change anywhere in the system is attributed to the
  employee or manager who made it, with a timestamp.
- **Employee PIN login** (shared phones/tablets) vs. **manager email+password login**,
  enforced by middleware.
- **Manager tools**: edit any part of any ticket, manage employee PINs and manager
  accounts, manage the garment/alteration option lists, and a basic analytics page.
- **Photo capture placeholder**: the UI and data model support photos now; actual file
  storage is intentionally not wired up yet (see `lib/images.ts` for how to connect it).
- **Branding**: the login screen shows the shop's circular "JFY" mark (`public/logo.png`,
  a transparent-background cutout so it sits directly on the page rather than in a white
  box). The browser tab icon, iOS "Add to Home Screen" icon, and Android/Chrome PWA
  install icon all use the dark rounded-square version instead (`app/icon.png`,
  `app/apple-icon.png`, `public/icons/icon-192.png` / `icon-512.png`) via Next's
  file-convention favicons plus `app/manifest.ts` — so a phone's home screen shows the
  same dark "JFY" mark as the app icon, not a generic browser icon. Both source images
  came from small screenshots (~260–320px), so the upscaled 512px icon is a little
  softer than a vector source would give — worth swapping in higher-res source art
  later if the shop has it, but it reads clean at the sizes these are actually shown at.
- **Itemized pricing**: a second, receipt-style step in the intake form where an
  employee can price out each selected alteration (plus freeform lines, e.g. a rush
  fee) — entirely optional, anything left blank can be filled in later. Once the
  ticket is created, the itemized breakdown becomes **manager-only** for both editing
  and *viewing* — employees still see the order's running total and payment status, but
  never the line-by-line breakdown. See "Itemized pricing" below for the full rule set.
- **Per-item work assignment**: any employee can "pick up" (claim) an unassigned item to
  work on, and a manager can assign or reassign any item to any active staff member —
  both are per-item, so different pieces of the same order can be worked by different
  people at once (e.g. one employee on the jacket, another on the trousers). This is
  **informational only** — it labels who's responsible, it does not gate who can
  actually change an item's status. See "Item assignments" below.
- **Rush orders**: an optional "Rush" flag set at intake (or later, by a manager) shows
  a small badge on the order everywhere it's listed, and rolls up into a "rush order
  share" stat in analytics.

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
  overall status, and each item's garment type + description + status (+ pickup date if
  applicable) — the description is included so a client can tell apart similar items on
  one order (e.g. which bridesmaid dress is which). Everything else — contact details,
  internal notes, measurements, staff names (including who picked an item up), payment
  status, and the audit log — is withheld by design. If you want to loosen this, it's a
  single, well-commented function: `lib/client-view.ts`.
- **Multi-manager support**: any manager can create additional manager accounts from the
  Staff page (useful once there's more than one manager/owner).
- **Order search date range**: filters by when the intake ticket was *created*, not the
  due date — "show me everything that came in during this window," not "what's promised
  this week." If you'd rather it (also) filter by due date, that's a small change to
  `listOrders` in `actions/orders.ts` plus a second toggle in `OrderSearchBar.tsx`.
- **Assignment is informational, not enforced**: claiming or being assigned an item does
  not lock other staff out of updating it — the shared-tablet workflow (anyone at the
  counter can move any item forward) still works exactly as before. Assignment is purely
  a "who's on this" label: it drives the "Assigned to me" dashboard filter and the team
  activity breakdown in analytics, nothing else. If you'd rather enforce it later (e.g.
  block `setItemStatus` unless `assignedToId` matches the caller, or is unset), that
  check would go at the top of `setItemStatus` in `actions/items.ts`.

## Itemized pricing

Added after the initial Phase 1 build, on top of the original "no pricing" decision above.

- **Entry point**: the intake form is now a two-step wizard. Step 1 is unchanged
  (client/pickup contact + items). Step 2, "Itemized pricing," auto-generates one price
  row per selected alteration on each item (plus a row for any custom-instructions text),
  and lets the employee add freeform rows too — either tied to one item (e.g. "extra
  fabric") or order-wide (e.g. a rush fee). Every row is optional; anything left blank
  simply isn't saved as a `PriceLine`, and a manager can add or fix it later.
- **The lock**: once the ticket is created, `createIntakeTicket` is the *only* place a
  non-manager is ever allowed to write a `PriceLine`. Every add/edit/delete after that
  goes through `actions/pricing.ts`, which is manager-only, full stop — mirroring how
  `garmentType`/`description` lock after intake, just with a dedicated action file
  instead of a manager-only branch inside `actions/items.ts`.
- **The visibility rule (stricter than the lock)**: this is the one place in the app
  where "locked" and "hidden" are different things. Every other intake-locked field
  (garment type, description, alterations) stays employee-*visible*, just read-only.
  Itemized pricing does not — once the order exists, an employee's `getOrderDetail()`
  result has every `PriceLine` stripped out server-side (see the redaction in
  `actions/orders.ts`), so the breakdown never reaches their page at all, not even in
  the RSC payload. What an employee *does* still see is `Order.totalPriceCents` (a
  denormalized sum, recomputed by `lib/pricing.ts` after every price-line change) and
  `paymentStatus` — enough to answer "how much do I owe" at the counter, but no
  itemized detail and no edit controls.
- **Analytics**: `actions/analytics.ts` returns total revenue and average order value
  (from `Order.totalPriceCents`), plus four breakdowns built from the itemized price
  lines themselves: revenue by alteration type, revenue by garment type, a revenue
  composition split (standard alterations / custom instructions / freeform write-ins),
  and an "Unpriced alterations" count — the literal number of checked alterations on
  open tickets that still have no price line, shown as a total and broken out per
  order (e.g. "3 unpriced") rather than an unexplained per-order flag. The alteration and garment breakdowns only work because
  `PriceLine.description` is a controlled vocabulary for `ALTERATION`-sourced rows
  (always the exact taxonomy label, never free text) — freeform write-ins have no such
  structure, which is why they stay lumped into one bucket in the composition split
  rather than broken out further. All of this is safe to aggregate raw since the whole
  action is already manager-gated.
- **Money handling**: everything is stored as integer cents (`PriceLine.amountCents`,
  `Order.totalPriceCents`); `lib/money.ts` has the only formatting/parsing helpers
  (`formatCents`, `parseDollarsToCents`) — nothing else should touch a raw dollar float.

## Item assignments

Added alongside the historical analytics below, on the flexible shared-tablet workflow
the shop already uses.

- **Entry points**: on any workable (not-yet-completed) item, unassigned items show a
  "Pick up this item" button — available to any signed-in employee or manager, no
  approval needed. Once claimed, the assignee (or a manager) can "Release" it back to
  unassigned. A manager also gets an "Assign… / Reassign…" control that opens a picker
  of active staff (both roles) and can hand the item to anyone, including someone else's
  claim. All three actions (`claimItem`, `assignItem`, `releaseItem` in
  `actions/items.ts`) are audit-logged (`ITEM_ASSIGNED` / `ITEM_UNASSIGNED`) and record
  `assignedAt`; `assignItem` is manager-only, `claimItem`/`releaseItem` are open to
  either role (an employee can only release their own claim; a manager can release
  anyone's).
- **Visibility**: who an item is assigned to is visible to both employees and managers
  on the order profile (unlike itemized pricing, this is not redacted for employees) —
  everyone at the counter can see who's working what. It's never shown on the public
  client tracking link.
- **Informational only**: see the assumptions list above — this does not restrict who
  can change an item's status.
- **"Assigned to me" filter**: both dashboards (`/employee`, `/manager`) have an
  "Assigned to me" toggle pill next to the status tabs, filtering to orders with at
  least one item assigned to the signed-in user. It stacks with search and the status
  tabs, and (like search) lives in the URL query string.
- **Cycle-time tracking**: a new `OrderItem.startedAt` timestamp is set once, the first
  time an item moves Not started → In progress (never overwritten if it's later reopened
  and restarted) — this is what powers the "avg. days to start work" analytics stat.

## Historical performance analytics

Added on top of the original analytics page — see "Itemized pricing → Analytics" above
for the pricing-specific breakdowns; this section covers the operational/historical side.
All of it lives in the new block at the bottom of `getAnalytics()` in
`actions/analytics.ts`, and renders in a new "Historical performance" section on the
manager analytics page.

- **Revenue & volume trend**: a 6-month bar chart of ticket count and revenue, bucketed
  by intake (`Order.createdAt`) month.
- **Turnaround trend**: on the same 6-month chart, average days from intake to sealing
  (`Order.sealedAt`), bucketed by the month the order *sealed* — a different date axis
  than the bars above it, deliberately, since "how fast are we finishing orders that
  complete this month" and "how much came in this month" are different questions merged
  into one chart for space.
- **On-time completion rate**: % of orders with a due date that sealed on or before it.
- **Avg. pickup lag**: average days between an item completing and being picked up.
- **Reopen rate**: % of items that were ever reopened after being marked complete —
  a rough proxy for rework/mistakes. Flagged in the UI if it climbs above 15%.
- **Avg. days to full payment**: average days from intake to the order's payment status
  being set to Paid, for orders currently Paid. This one is inherently a little fragile —
  there's no structured "payment changed" table, so it works by pattern-matching the
  audit log's summary text for `updatePaymentStatus`'s "set to PAID by" wording. If that
  summary template ever changes, this stat silently goes to zero rather than erroring;
  worth a quick sanity check after any edit to `updatePaymentStatus` in `actions/orders.ts`.
- **Rush order share**: % of all orders flagged Rush at intake (or since).
- **Avg. days to start work**: average gap between intake and the first item actually
  being started (`OrderItem.startedAt`, described above).
- **Team activity**: a per-staff table — tickets created, items completed, pickups
  authorized, and items currently assigned — limited to currently-active staff (someone
  deactivated from Staff drops off the table, even if they have historical activity).

**Seeing it with real data**: `prisma/seed-historical-demo.ts` backfills ~30 backdated
orders (Apr–Aug) spread across your actual staff — it looks up your real employees and
managers by name (edit `EMPLOYEE_NAMES`/`MANAGER_NAMES` at the top of the file if your
roster changes) rather than creating throwaway accounts, so every chart and the team
activity table show real names. Every order it creates is tagged `[DEMO-HIST]` in the
client name so it's obviously not a real client and easy to remove later. Run it with
`npm run db:seed:historical-demo`; remove everything it made with
`npm run db:seed:historical-demo:clear`. It's a separate tag from the
`[DEMO]`-prefixed orders `seed-pricing-demo.ts` makes, so clearing one never touches
the other.

## Client order lookup

Added because handing a client their tracking link required a text or email in the
moment, which wasn't always practical at the counter. This is additive — the existing
`clientToken` link keeps working exactly as before for anyone it's already been sent to;
this just gives staff a second way to get a client into the same page.

- **How it works**: `/track` (no token) is a new public page — order number + phone
  number in, and on a match it redirects into the existing, unchanged `/track/[token]`
  view. It never renders any order data itself; the lookup either finds a `clientToken`
  and redirects, or shows a generic "couldn't find a match" message. All the logic lives
  in one function, `lookupClientToken()` in `lib/client-view.ts`, right next to the
  redaction rules it hands off to.
- **What counts as a match**: the order number (accepts `JFY-000123`, `000123`, `123`,
  lowercase, no dash — anything with the right digits) plus a phone number matching
  either `Order.clientPhone` or `Order.pickupContactPhone`, compared digit-only (so
  formatting like dashes/parens/a leading country code doesn't matter). Wrong order
  number, wrong phone, or an order that doesn't exist all produce the exact same "no
  match" response — it never hints at which part was wrong, so a guess reveals nothing.
- **Why phone + order number and not just the order number**: order numbers are
  sequential (`JFY-000123`, `JFY-000124`, ...) and easy to guess or enumerate; a phone
  number on file is a second factor that isn't derivable from the order number itself.
  This is the "fair compromise between security and simplicity" tradeoff, as opposed to
  either a bare `/track/{order number}` link (rejected — no second factor) or shortening
  the existing random `clientToken` (a separate, independent idea, not done here).
- **Basic brute-force throttling**: `lib/rate-limit.ts` adds a small in-memory cap (8
  attempts per IP per 10 minutes) on the lookup action. It's explicitly best-effort —
  counters reset on every deploy/restart and don't coordinate across multiple instances
  — but for a single small shop's traffic it's a free deterrent against someone
  scripting through phone numbers for a known order number. Swap it for a real
  rate-limiting store later if this ever needs to hold up under real abuse.
- **Where staff see it**: the order profile's "Copy client tracking link" area now also
  shows the `/track` URL and that order's number as a one-line hint, so staff can just
  tell a client "go to [site]/track and enter your order number and phone number" without
  needing to send anything.

## Project structure

```
app/                      Next.js App Router pages
  login/                   Employee PIN + manager credential login
  employee/                Employee dashboard, new-intake form, order working profile
  manager/                 Manager dashboard, order profile, staff, taxonomy, analytics
  track/[token]/           Public read-only client tracking page
  track/page.tsx           Public order-number + phone lookup page (routes into the above)
actions/                  Server actions (all mutations + audit logging live here)
  pricing.ts               MANAGER ONLY: add/edit/delete a PriceLine after intake
  track.ts                 Public (not gated): order-number + phone lookup action
lib/                      DB client, auth/session, audit log, order numbering,
                           order-status lifecycle, client-view redaction
  pricing.ts                recomputeOrderTotal — call inside any PriceLine mutation's tx
  money.ts                   formatCents / parseDollarsToCents — the only place cents<->dollars happens
  rate-limit.ts              Best-effort in-memory throttle, used by actions/track.ts
components/               Shared UI (forms, item cards, order profile, nav, etc.)
  PriceLineEditor.tsx        Shared manager-only price-line row/add-form (ItemCard + OrderProfile)
  OrderSearchBar.tsx         Client + date-range search box for the employee/manager order lists
  ItemCard.tsx                Includes the ItemAssignment control (claim / assign / release)
prisma/schema.prisma      Full data model
prisma/migrations/        Hand-authored migrations (ready for `migrate deploy`)
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
| Authorize item pickup (partial or full order)         |   Yes    |   Yes   |
| Undo an accidental pickup                             |    No    |   Yes   |
| Manage employee PINs / names / manager accounts      |    No    |   Yes   |
| Manage garment/alteration options                    |    No    |   Yes   |
| View analytics                                       |    No    |   Yes   |
| Enter itemized pricing **at intake creation only**    |   Yes    |   Yes   |
| View / edit itemized pricing **after** intake exists  |    No    |   Yes   |
| View order total & payment status                     |   Yes    |   Yes   |
| Claim an unassigned item / release own claim           |   Yes    |   Yes   |
| Assign or reassign an item to any staff member         |    No    |   Yes   |
| Release another staff member's claim                   |    No    |   Yes   |
| Flag an order as Rush                                  |   Yes    |   Yes   |

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
- **Pricing**: itemized pricing now exists (see "Itemized pricing" above). Not yet
  built: a manager-facing "print/export receipt" view of the breakdown, and any
  concept of partial payments/deposits beyond the existing `Unpaid`/`Deposit paid`/
  `Paid` status enum — `Order.totalPriceCents` is a total, not a running balance.
- **SMS/email notifications**: intentionally out of scope — the brief was explicit that
  this phase is about giving clients *access* to status, not pushing them updates.
- **Multi-location**: the schema has no location/store concept yet; if a second location
  is ever added, that's a new `Location` model plus a foreign key on `Order` and `User`.
