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

## Security hardening

A pass through the whole app looking for weak points, once Phase 1 itself had settled.
None of these change how the app behaves day-to-day — they close gaps a normal workflow
would never hit.

- **Login throttling**: `employeeLogin`/`managerLogin` (`actions/auth.ts`) now run
  through `lib/rate-limit.ts` twice per attempt, on two different keys. A per-IP cap (20
  attempts / 10 min) catches someone hammering many accounts from one place; a stricter
  per-account cap (6 attempts / 10 min, keyed by employee id or manager email) catches a
  targeted brute force of ONE account from many IPs or devices — which matters
  especially for employee PINs, since the login screen's name picker has to publicly
  list every employee's id for the dropdown, and PINs can be as short as 4 digits. A
  failed attempt against a real account also writes an `EMPLOYEE`/`LOGIN_FAILED` row to
  the audit log (with the source IP in the summary), so repeated failures against one
  account are now visible in the existing audit trail, not invisible. Both throttles
  reuse the same best-effort, in-memory `isRateLimited()` as the `/track` lookup — see
  that function's own comment for what "best-effort" means here.
- **Client IP detection** (`lib/rate-limit.ts:getClientIp()`): prefers Cloudflare's
  `cf-connecting-ip` header (this app sits behind Cloudflare — see the custom domain
  section above — and Cloudflare overwrites that header at its edge, so a client can't
  forge it), falling back to the *last* hop of `x-forwarded-for` (the one entry a client
  can't forge, since a client can only prepend fake entries to that header, not remove
  the one Railway's own proxy appends) rather than the first, spoofable one. Shared by
  the login throttles and the `/track` lookup throttle.
- **Sessions are revoked on deactivation, not just blocked at next login**
  (`lib/auth.ts`): a session cookie used to be validated purely by JWT signature and
  expiry, so deactivating an employee or manager (Staff → Deactivate) only stopped
  *future* logins — anyone already signed in kept working on that device for up to the
  rest of their 12-hour session. `requireSession()`/`requireManager()`/
  `getOptionalSession()` now re-check the account's `active` flag (and role) against the
  database on every call, and sign the cookie out immediately if it no longer matches.
  This costs one indexed lookup per guarded page load or action — worth it at this app's
  scale for "I just deactivated someone and they still have the tablet" to actually mean
  what it sounds like.
- **Manager self-service password change**: a new "My account" page
  (`/manager/account`, linked from the top nav) lets a manager change their own
  password, given their current one. There was previously no way to do this from inside
  the app at all — not for the account `prisma/seed.ts` creates on first run, and not
  for a "temporary password" set when creating another manager from Staff — only direct
  database access could rotate one. **If you're still signing in with the seeded
  default** (`manager@justforyoualterations.com` / whatever `SEED_MANAGER_PASSWORD` was
  or defaulted to — printed once to the console the first time `db:seed` ran), change it
  from this page now that it exists.
- **`listTaxonomy()` guard fix** (`actions/taxonomy.ts`): this was calling
  `getOptionalSession()` but never checking what it returned, so despite its own
  comment ("Any signed-in user needs these") it was actually callable by anyone,
  signed in or not — server actions are directly-invokable endpoints, not just buttons
  in the UI. Low severity (it only exposes your garment/alteration option labels, not
  client data) but a real bug; now uses `requireSession()` like every other
  any-signed-in-user action.
- **Security headers** (`next.config.js`): every response now sets
  `X-Frame-Options`/`frame-ancestors` (clickjacking), `X-Content-Type-Options: nosniff`
  (MIME-sniffing), `Referrer-Policy`, a `Permissions-Policy` disabling camera/mic/
  geolocation (unused by this app), `Strict-Transport-Security`, and a
  Content-Security-Policy scoped to this app's own origin. See the comment above
  `securityHeaders` in `next.config.js` for why `script-src`/`style-src` still allow
  `'unsafe-inline'` (Next's own hydration bootstrap needs it without a nonce-based CSP,
  which is a bigger follow-up change) and why that's an acceptable tradeoff here — this
  app has no `dangerouslySetInnerHTML` and never renders user-supplied HTML anywhere.
- **One JWT secret/algorithm source, not two**: `middleware.ts` used to re-derive the
  session secret itself with a silent `process.env.SESSION_SECRET || ""` fallback,
  separate from `lib/session.ts`'s fail-loud version — not currently exploitable (a
  mismatched secret just fails closed, redirecting to login) but duplicated logic that
  could drift. Both now import the same `getSecret()`/`JWT_ALGORITHMS` from the new
  `lib/jwt-config.ts` (kept dependency-free of `next/headers` on purpose, so importing
  it into `middleware.ts`'s Edge bundle doesn't drag in anything Node-only), and both
  `jwtVerify()` calls now pin `algorithms: ["HS256"]` explicitly rather than relying on
  the library's own inference.
- **Verified, not just assumed**: this app's pinned Next.js version (`^14.2.35`) is past
  `14.2.25`, the version that patched
  [CVE-2025-29927](https://github.com/advisories/GHSA-f82v-jwr5-mffw), a critical
  middleware-authorization-bypass bug — worth knowing given `middleware.ts` is this
  app's first gate for `/manager` and `/employee`. (It's a first gate only, not the only
  one — see the point above: every one of those pages and every server action
  independently re-runs `requireSession()`/`requireManager()`, so even a middleware-only
  bypass wouldn't by itself have exposed page data. Still good to be patched.)

## Manager correction tools

A second pass, after security hardening, looking specifically for fields or records
that were **truly locked with no correction path** — not a permissions gap, but a
place where even a manager had no way to fix an honest mistake short of direct
database access. Everything below follows one rule the audit surfaced: **any
corrective action has to itself be reversible**. Nothing here permanently deletes
anything — it's all additive to the app's existing "never truly erase, always keep
history" philosophy (append-only notes before this, the permanent audit log, undo
pickup).

- **Cancel / restore an order** (`cancelOrder`/`uncancelOrder` in
  `actions/orders.ts`, button on the order profile): fixes the "duplicate ticket /
  wrong client / test order" case, which previously had no way to get an order out
  of every list, search result, and analytics number it was skewing. Cancelling
  sets a new sticky `OrderStatus.CANCELLED` — `recomputeOrderStatus`
  (`lib/order-status.ts`) bails out immediately for a cancelled order rather than
  ever silently deriving it back to something else, so nothing about touching its
  items can accidentally un-cancel it. Only `uncancelOrder` recomputes a fresh
  status from the order's current items. A cancelled order, its items, notes,
  measurements, and audit trail are all untouched and still viewable — cancelling
  only removes it from the *active* view of the business, not from the record.
- **Remove / restore an item** (`removeItem`/`restoreItem` in `actions/items.ts`,
  button on each item card): fixes "an item was added to the wrong order, or
  duplicated, and needs to come off it" — previously `addItemToOrder` had no
  undo. Only allowed while an item is still `PENDING`/`IN_PROGRESS`: once it's
  `COMPLETED` or `PICKED_UP` it's real operational history, not a data-entry
  mistake, and `updateItemIntake` is the right tool to fix its details instead.
  Also refuses to remove the last remaining (non-removed) item on an order —
  `recomputeOrderStatus` has nothing to derive a status from with zero items, so
  cancel the whole order instead if that's really the goal. A removed item is
  greyed out on the order profile with a one-click Restore, and is excluded from
  order-status derivation, the "N/M items done" list counts, the public tracking
  page, and analytics — see the exclusion pass below.
- **Manager account correction** (`editManagerAccount`/`setManagerActive` in
  `actions/employees.ts`, on the Staff page): a manager account's name and email
  were previously fixed at creation forever — not even another manager could fix a
  typo. `editManagerAccount` lets any manager fix another's name/email (checked
  for an email conflict first); it deliberately never touches password, which
  stays strictly self-service (`changeMyPassword`, from the security-hardening
  pass) so one manager can never silently take over another's login.
  `setManagerActive` mirrors the existing employee deactivate/reactivate control,
  extended to managers, with two guardrails since getting this wrong locks
  everyone out with no recovery path short of the database: a manager can't
  deactivate their own account, and can't deactivate the last remaining active
  manager account.
- **Item note correction** (`editItemNote`/`deleteItemNote` in `actions/items.ts`,
  Edit/Delete on each note): `ItemNote` previously had zero correction path for
  anyone — not even its own author could fix a typo or a wrong measurement jotted
  down in the moment. Now the note's own author can edit or delete it themselves,
  and a manager can correct or remove *anyone's* note (an employee still can't
  touch someone else's). This isn't a free edit, though: every edit/delete is
  itself audit-logged with the note's previous text in the summary (`was:
  "..."`), so nothing is ever silently rewritten, even by its own author — the
  log always keeps what it used to say, who changed it, and when. That's the
  actual property worth protecting; requiring a *manager specifically* to fix a
  typo wasn't adding anything beyond that. The original author's name and
  original timestamp are left as-is on an edit (it's a correction, not a
  re-authoring).
- **Garment/alteration label rename** (`renameGarmentType`/`renameAlterationType`
  in `actions/taxonomy.ts`, the "✎" button next to each option on the Taxonomy
  page): previously the only way to fix a misspelled option label was deactivating
  it and adding a fresh, correctly-spelled one — leaving the typo sitting in the
  list forever (and technically still selectable data, just hidden from new
  intake). A rename only affects the picker going forward; existing items keep
  whatever `garmentType`/alteration label string they were created with (it's
  copied at intake time, not a live reference), so renaming never rewrites
  historical tickets.
- **Excluded from active lists and analytics**: a cancelled order or a removed
  item now has to be excluded everywhere the app previously assumed every
  order/item still standing was live business — the order list's status filters
  and "assigned to me"/progress counts, the public tracking page
  (`lib/client-view.ts`), and roughly fifteen of `getAnalytics()`'s queries in
  `actions/analytics.ts` (revenue, order counts, payment/turnaround/reopen-rate
  stats, team activity, etc.), each with an inline comment explaining the filter.
  Two spots were **deliberately left un-filtered**, on purpose rather than by
  oversight: `orderStatusCounts` still shows `CANCELLED` as its own bucket (so
  "how many cancelled orders" is itself a visible stat), and the
  `itemsCompletedByUser`/`pickupsAuthorizedByUser` team-activity breakdowns aren't
  joined against order-cancellation, since an item structurally can't reach
  `COMPLETED`/`PICKED_UP` while removed, and a real item completed before its
  order was later cancelled is a rare edge case not worth an extra join for.
- **Not fixed in this pass, flagged instead**: `Order.sealedById` exists in the
  schema and is cleared on reopen, but nothing ever actually sets it when an order
  seals — so "who sealed this" is silently always blank. Fixing it properly means
  threading a `sealedById` through every code path that can trigger
  `recomputeOrderStatus` (six-plus call sites), which felt disproportionate to
  bundle into this pass. Left as a known follow-up rather than silently dropped.

## Reliability & data-integrity hardening

A third pass, prompted by a full read-through looking specifically for correctness
and scaling issues rather than missing features: places where the app would do the
wrong thing under concurrent use, silently disagree with its own audit trail, or
just get slower as real order history piles up. Nothing here changes what any
action does when used one request at a time — it's all about what happens when two
people click at once, or when a write to the database and its audit-log entry
could disagree about whether something actually happened.

- **Cancelled orders and removed items are now actually frozen.** Before this
  pass, `cancelOrder`/`removeItem` (above) recorded the cancellation/removal, but
  nothing stopped further "new work" mutations from still landing on a cancelled
  order or a removed item — editing its intake details, adding notes, changing
  status, adding price lines, and so on all still silently succeeded, which
  undercut the whole point of cancelling something. Every action that does *new*
  work (`updateItemIntake`, `setItemStatus`, `reopenItem`, `addItemNote`,
  `upsertMeasurement`, `addImagePlaceholder`, `authorizeItemPickup`, `claimItem`,
  `assignItem`, `addItemToOrder` in `actions/items.ts`; `updateOrderIntake`,
  `updateGeneralNotes`, `updatePaymentStatus` in `actions/orders.ts`;
  `addPriceLine` in `actions/pricing.ts`) now checks first and refuses with a
  plain-language error if the order is cancelled or, for item-level actions, the
  item itself is removed. Actions that *correct or reverse* existing state
  (`editItemNote`/`deleteItemNote`, `deleteMeasurement`, `restoreItem`,
  `undoItemPickup`, `releaseItem`, `updatePriceLine`/`deletePriceLine`) are
  deliberately left open on a cancelled order — the same "a correction should
  always be possible" reasoning as the correction tools themselves. `cancelOrder`/
  `removeItem` stay reversible either way.
- **Audit log writes are now atomic with the change they describe.** `lib/audit.ts`
  has always said mutations shouldn't be able to succeed if their audit entry
  fails to write — but several actions across `actions/items.ts`,
  `actions/orders.ts`, and `actions/pricing.ts` called `logAudit` in a separate
  statement *after* their `db.$transaction` had already committed, so a crash or
  DB hiccup between the two could leave a real change with no audit trail at all.
  Every mutating action in those three files now does its data change and its
  `logAudit` call inside the same `$transaction`, passing the transaction client
  through — either both happen or neither does.
- **Two race conditions fixed, both confirmed against real concurrent Postgres
  transactions (not just read by eye):**
  - `claimItem` (`actions/items.ts`) used to read the item, check it was
    unassigned, then write — two people tapping "Claim" on the same item at
    nearly the same moment could both pass the check and both "win." It's now a
    single atomic `updateMany({ where: { id, assignedToId: null }, ... })` and
    checks the affected-row count; a stress test of 20 concurrent claim pairs
    against a scratch database produced exactly one winner and one no-op every
    time, zero double-claims.
  - `removeItem` (`actions/items.ts`) refuses to remove an order's last active
    item, but the check-then-delete was two separate statements — two managers
    removing the last two items at once could each see "one other item still
    active" and both proceed, leaving zero. The transaction now runs at
    `Serializable` isolation, and a scratch-database test that forced two such
    removals to overlap confirmed Postgres itself aborts the loser with a
    serialization failure (Prisma's `P2034`) rather than letting both through;
    `removeItem` catches that specific error and returns "that order changed at
    the same time — please try again."
- **Order search now has real indexes behind it.** `listOrders`'s search box
  matches client name/phone/email, pickup contact name/phone, and order number
  with a case-insensitive substring match — which a plain index can't serve, so
  every search was a full table scan. A new migration
  (`prisma/migrations/20260902010000_add_trigram_search_indexes`) enables
  Postgres's `pg_trgm` extension and adds a GIN trigram index on each of those
  six columns; verified against a scratch database (20k+ seeded rows) that the
  indexed and un-indexed query plans return identical result counts. Raw SQL,
  not expressed in `schema.prisma` — Prisma's DSL only gets GIN/trigram support
  behind a preview feature this app doesn't otherwise need for one search box.
- **Order lists are now paginated instead of hard-capped at 100.** `listOrders`
  used to silently `take: 100` and stop — past that, older orders just
  disappeared from every filter view with no indication anything was cut off.
  It now takes `page`/`pageSize` (default 25, capped at 100) and returns
  `{ orders, total, page, pageSize, hasMore }`; the manager and employee
  dashboards read/write `page` as a URL query param alongside the existing
  filter/search/mine params, with a "Showing X–Y of N" line and Previous/Next
  links. Changing the status tab, the "assigned to me" toggle, or the search box
  all reset back to page 1, since whatever page you were on no longer means
  anything once the underlying result set changes.
- **`getOrderDetail` no longer fetches an item's notes/images unbounded.** Same
  shape of issue as the order list: nothing stops an item from accumulating a
  very large number of notes or photos over a long-running order, and every one
  of them was being fetched on every page load. Capped at 100 notes and 50
  images per item (most-recent-first, matching how the UI already orders them —
  same pattern the audit log already used with its own `take: 50`).

## Project structure

```
app/                      Next.js App Router pages
  login/                   Employee PIN + manager credential login
  employee/                Employee dashboard, new-intake form, order working profile
  manager/                 Manager dashboard, order profile, staff, taxonomy, analytics
  manager/account/         Manager's own "change my password" page
  track/[token]/           Public read-only client tracking page
  track/page.tsx           Public order-number + phone lookup page (routes into the above)
actions/                  Server actions (all mutations + audit logging live here)
  pricing.ts               MANAGER ONLY: add/edit/delete a PriceLine after intake;
                             addPriceLine guards against a cancelled order/removed item
  track.ts                 Public (not gated): order-number + phone lookup action
  auth.ts                   Login (rate-limited), logout, changeMyPassword (self-service)
  orders.ts                 listOrders takes page/pageSize, returns { orders, total,
                             page, pageSize, hasMore }. Includes cancelOrder/uncancelOrder
                             (MANAGER ONLY, reversible)
  items.ts                  Includes removeItem/restoreItem (MANAGER ONLY, reversible;
                             removeItem runs Serializable to avoid a last-item race) and
                             editItemNote/deleteItemNote (self-author-or-manager, always
                             audit-logged — see "Manager correction tools" below).
                             "New work" actions refuse a cancelled order/removed item.
  employees.ts               Includes editManagerAccount/setManagerActive (MANAGER ONLY)
  taxonomy.ts                Includes renameGarmentType/renameAlterationType (MANAGER ONLY)
lib/                      DB client, auth/session, audit log, order numbering,
                           order-status lifecycle, client-view redaction
  auth.ts                    requireSession/requireManager — re-checks `active` per request
  jwt-config.ts               Shared JWT secret/algorithm, used by lib/session.ts AND middleware.ts
  order-status.ts             recomputeOrderStatus — CANCELLED-sticky, excludes removed items
  pricing.ts                recomputeOrderTotal — call inside any PriceLine mutation's tx
  money.ts                   formatCents / parseDollarsToCents — the only place cents<->dollars happens
  rate-limit.ts              Best-effort in-memory throttle + getClientIp() — used by
                              actions/track.ts and actions/auth.ts's login throttling
components/               Shared UI (forms, item cards, order profile, nav, etc.)
  PriceLineEditor.tsx        Shared manager-only price-line row/add-form (ItemCard + OrderProfile)
  OrderSearchBar.tsx         Client + date-range search box for the employee/manager order
                               lists; resets the page query param on every new search
  ItemCard.tsx                Includes the ItemAssignment control (claim / assign / release)
  ChangePasswordForm.tsx      Used by app/manager/account
prisma/schema.prisma      Full data model (includes Phase 2's Punch/Shift models — see below)
prisma/migrations/        Hand-authored migrations (ready for `migrate deploy`), including
                            a raw-SQL migration adding pg_trgm trigram search indexes
prisma/seed.ts            Creates first manager login + default taxonomy
phase2/PLAN.md            Phase 2 (timeclock + scheduling) evaluation trail and design notes —
                            not code, just the planning document; see below for the actual feature
```

### Phase 2 — Timeclock & Scheduling (flagged off by default)

A second feature, built and wired in but gated behind a feature flag so it
ships dark until it's ready to turn on. See `phase2/PLAN.md` for the full
story (why not Homebase's own API, why not TimeTrex Community Edition, why
native) — short version:

- `Punch`/`Shift` models in `prisma/schema.prisma`, `actions/punches.ts` +
  `actions/shifts.ts`, `lib/hours.ts` (punch → hours calculation, no pay
  rate/overtime math — deliberately deferred), `lib/dates.ts`, and five
  components (`ClockPad`, `DailyTotalsTable`, `PunchReviewList`,
  `ScheduleBuilder`, `MyScheduleList`) plus their pages under
  `app/employee/{timeclock,schedule}` and `app/manager/{timeclock,schedule}`.
- **`PHASE2_ENABLED`** (`lib/feature-flags.ts`) gates all of it — off by
  default. With it unset or false, `TopNav` shows no Timeclock/Schedule
  links and the pages themselves redirect back to the normal dashboard.
  Set `PHASE2_ENABLED=true` in Railway's environment variables and
  redeploy/restart to turn it on; unset it and redeploy/restart to turn it
  back off — no code change either way.
- **Needs a migration before it can be turned on** — the schema is edited
  but no migration has been generated/run yet. Run
  `npx prisma migrate dev --name add_phase2_timeclock_scheduling` against a
  scratch/local database first, review the generated SQL (purely additive —
  two new tables, no existing table altered), then deploy as usual (`npm
  start` already runs `prisma migrate deploy` first). Only flip
  `PHASE2_ENABLED` on after that migration has run against production.

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
| Change own password (`/manager/account`)              |    N/A   |   Yes (self only) |
| Manage garment/alteration options                    |    No    |   Yes   |
| View analytics                                       |    No    |   Yes   |
| Enter itemized pricing **at intake creation only**    |   Yes    |   Yes   |
| View / edit itemized pricing **after** intake exists  |    No    |   Yes   |
| View order total & payment status                     |   Yes    |   Yes   |
| Claim an unassigned item / release own claim           |   Yes    |   Yes   |
| Assign or reassign an item to any staff member         |    No    |   Yes   |
| Release another staff member's claim                   |    No    |   Yes   |
| Flag an order as Rush                                  |   Yes    |   Yes   |
| Cancel / restore an order                              |    No    |   Yes   |
| Remove / restore an item                               |    No    |   Yes   |
| Edit / delete your own item note                        |   Yes    |   Yes   |
| Edit / delete another staff member's item note           |    No    |   Yes   |
| Edit another manager's name/email                      |    No    |   Yes   |
| Deactivate / reactivate a manager account               |    No    |   Yes (not self, not the last active manager) |
| Rename a garment/alteration option label                |    No    |   Yes   |

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
7. Log in as that manager and change the password from **My account**
   (`/manager/account`) if you're still using the seeded/printed one.
8. Add employees and their PINs from **Staff** in the manager app.

Because `start` runs migrations automatically, future schema changes just need a new
migration file committed (`npx prisma migrate dev --name your_change` locally against a
dev database) — Railway will apply it on the next deploy.

**Phase 2 (timeclock + scheduling)**: not live until you generate/run its migration
(`npx prisma migrate dev --name add_phase2_timeclock_scheduling`, see "Project structure"
above) and set `PHASE2_ENABLED=true` in Variables — leave it unset until then.

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
