# Phase 2 — Scheduling & Timeclock

## Status: wired in, behind a flag — off by default, payroll math still deferred

**Both timeclock and scheduling are built and wired into the live app now**,
gated behind a `PHASE2_ENABLED` environment variable that defaults to off
(see "Wired in" below for exactly what changed and where everything lives —
it's no longer under this `phase2/` folder). TimeTrex Community Edition is
**not** being adopted, even for timeclock alone — reversing the earlier
"split the tools" call. See "Reconsidered: is TimeTrex CE worth it at all?"
for why: its core punch/overtime engine turned out to be genuinely unlocked
at Community tier (not crippled), but the operational cost of self-hosting
it is real and confirmed, and everything it's *not* gating is
straightforward to build directly in JFY's existing Prisma/Postgres stack.
"How we got here" below is kept as the historical evaluation trail
(BuddyPunch, then TimeTrex CE's scheduling module, then TimeTrex CE's
hosting complexity) — read the reconsideration section first, it supersedes
the "split the tools" decision at the end of that trail.

**Scope, deliberately narrowed for this pass**: raw punch capture, hours-worked
totals, and scheduling only. No pay rate, no overtime multiplier, no payroll
export — that's on hold until you've confirmed how payroll/accounting
actually runs today (in-house, an accountant, a processor like Gusto/ADP).
Nothing built so far computes or stores a dollar amount for anyone's time.

**This folder (`phase2/`) is now just this planning document** — the actual
code lives in the real `app/`, `actions/`, `components/`, `lib/`, and
`prisma/schema.prisma`, same as every other feature in this repo. It's kept
around because the evaluation trail below (why not Homebase's API, why not
TimeTrex, the market due-diligence pass) is worth having on hand, and
because there's still one real step left before any of this is *live*: a
migration you run yourself (see "Wired in" below).

## The problem being solved

The shop currently uses **Homebase** for scheduling and timeclock. Reported
issues: heavy response/feedback lag, and it "constantly messes up" timeclock
records — presumably lost/duplicate punches, wrong totals, or edits that don't
stick. The ask is a **reliable replacement**.

## Chosen direction

A custom scheduling/timeclock UI **inside the JFY app** — the same staff who
already log into JFY to work order tickets would also clock in/out and see
their schedule there, in one app instead of two. Both halves are now built
**natively**, in JFY's existing Postgres/Prisma database with its own server
actions — no external vendor, no second service:

- **Timeclock**: a `Punch` table (clock in/out/break events, tied to
  `User.id`) plus a calculation layer that turns punches into daily/weekly
  **hours-worked** totals — no pay rate, no overtime multiplier yet, see the
  scope note above. See "Reconsidered: is TimeTrex CE worth it at all?"
  below for why self-hosting TimeTrex CE for this — the original plan — was
  dropped.
- **Scheduling**: its own tables, own server actions, no vendor. This part
  of the decision hasn't changed since it was first made — TimeTrex CE's
  scheduling module exists in the source tree but is licensed out at the
  Community tier (see "How we got here"), so there was never a free
  third-party scheduler to lean on here either way.

Went with a custom UI (over staff using some other app's UI directly) for
the same reason as originally reasoned through with BuddyPunch: a second
login/app is exactly the kind of friction that makes people avoid a
timeclock tool, and this is the option that actually removes Homebase from
anyone's daily workflow.

## Wired in — where everything actually lives now, and the safety toggle

Everything below moved out of `phase2/` into the real app. Nothing changed
functionally in the move — every file's imports were written in advance so
the move itself needed zero find-and-replace.

- **`prisma/schema.prisma`** — the `Punch` model (single timestamped events —
  `CLOCK_IN`/`CLOCK_OUT`/`BREAK_START`/`BREAK_END` — not a precomputed "shift
  record," so correcting one bad punch automatically fixes every total
  derived from it), the `Shift` model (draft/published scheduling,
  soft-cancel, same philosophy as `Order.CANCELLED`), and the matching
  relation fields on `User`. Both follow Phase 1's existing patterns:
  soft-delete everywhere, an audit trail on every mutation, nothing
  hard-deleted. **Still needs a real migration** — see "One step still
  needed" below.
- **`lib/audit.ts`** — widened by one line (`entityType` now also accepts
  `"PUNCH" | "SHIFT"`) rather than duplicated, so there's exactly one audit
  function in the codebase, not two.
- **`lib/hours.ts`** — the actual punch → hours calculation, pure and
  dependency-free. Pairs raw punches into work sessions, subtracts break
  time, sums to daily totals — **and never silently drops a messy
  real-world day**: a missed clock-out, a double clock-in, an unended break
  all show up as an explicit `flags` entry for a manager to review, instead
  of quietly producing a wrong number. No pay rate, no overtime multiplier
  — see its file header.
- **`lib/dates.ts`** — small Monday–Sunday week-range helpers shared by the
  pages below.
- **`lib/feature-flags.ts`** — new: `isPhase2Enabled()`, the on/off switch
  described below.
- **`actions/punches.ts`** — clock in/out/break (self-service, blocks
  invalid transitions like clocking out mid-break), daily totals (self and,
  for managers, any/all employees), and the correction surface: manager-only
  edit/void of a punch (never a silent rewrite — the audit log keeps the
  before/after) and manually backfilling a missed punch.
- **`actions/shifts.ts`** — manager-only shift create/edit/publish/cancel,
  plus range queries for the schedule-builder view (all shifts) and the
  employee "my schedule" view (published only, never drafts).
- **`components/`** — `ClockPad` (the employee clock-in/out/break button),
  `DailyTotalsTable` + `PunchReviewList` (manager hours review and
  correction UI), `ScheduleBuilder` (manager schedule builder, with inline
  edit/publish/cancel), `MyScheduleList` (employee's read-only schedule).
- **`app/employee/timeclock`, `app/employee/schedule`,
  `app/manager/timeclock` (+ a `[userId]` sub-page for the punch-correction
  view), `app/manager/schedule`** — the four real pages, each starting with
  `if (!isPhase2Enabled()) redirect(...)` back to the normal dashboard.
- **`components/TopNav.tsx`** — now shows "Timeclock" and "Schedule" links
  (to both roles) only when the flag is on; otherwise the nav looks exactly
  as it did before this pass.

**The safety toggle**: set `PHASE2_ENABLED=true` in Railway's environment
variables (see `.env.example`) and redeploy/restart to turn this on;
remove it (or set it to anything else) and redeploy/restart to turn it back
off. No code revert needed either way — the flag is checked both in the
nav (so the links disappear) and in each page itself (so directly visiting
a URL bounces back to `/employee` or `/manager` instead of half-rendering).
The `Punch`/`Shift` tables exist and can be written to regardless of the
flag — turning it off doesn't touch or hide anything already recorded, it
only controls whether staff can reach the feature.

**What's deliberately not built yet**: any pay rate, overtime rule, or
payroll export (see "Status" above). Also not built: an admin UI for
creating/deactivating staff accounts for Phase 2 purposes — it reuses Phase
1's existing `User` model and `app/manager/employees` staff management
as-is, nothing new needed there.

## One step still needed before this can go live: the migration

Everything above is real code sitting in the repo, but the `Punch`/`Shift`
tables don't exist in any actual database yet — `prisma/schema.prisma` has
been edited, but a **migration** is what turns a schema edit into real SQL
that creates the tables. That's the one step I can't do for you (no
database connection from here), and per how we've done every schema change
so far, it's the one step you always run yourself:

1. Pull this code down and run `npx prisma migrate dev --name add_phase2_timeclock_scheduling`
   against a scratch or local Postgres database (not production) — this
   generates the actual migration SQL from the schema diff and applies it
   there so you can see exactly what it does before it touches anything real.
2. Review the generated migration under `prisma/migrations/` — it should be
   purely additive (two new tables, some new nullable columns via the
   relation fields on `User`... actually no new columns on `User` itself,
   just two new tables and their foreign keys). Nothing here alters or
   drops any existing table.
3. Commit it and deploy as usual. This repo's `npm start` already runs
   `prisma migrate deploy` before `next start` (see `package.json`), so the
   migration applies automatically on the next Railway deploy — same as
   every migration so far, including the trigram-index one from the
   reliability pass.
4. Only after that migration has run against production does it make sense
   to set `PHASE2_ENABLED=true` there — the pages would error without the
   tables existing, so leave the flag off until step 3 has actually shipped.

## Isolation strategy (historical) — how this stayed safe before it was wired in

This section describes the approach used *while Phase 2 was still a draft*,
before the "Wired in" section above happened. Keeping it for the record,
since the same reasoning is why wiring in was safe to actually do once the
draft was reviewed:

Everything for Phase 2 lived under `phase2/`, a plain directory that sat
**outside** every path Next.js's build touches (`app/`, `actions/`,
`components/`, `lib/`), and outside `prisma/schema.prisma`. Concretely:

- Next.js's App Router turns files under `app/` into live routes by their
  file path alone — there's no "unlinked but present" state for anything in
  there. So Phase 2's pages/routes were **not** created under `app/` at
  first; they were built and reviewed under `phase2/` first.
- Server actions and lib code followed the same rule: draft under
  `phase2/`, move into `actions/`/`lib/` only as a deliberate, reviewed step
  (now done — see "Wired in").
- Schema changes were drafted as their own commented-out file under
  `phase2/` and only turned into real Prisma model definitions in
  `prisma/schema.prisma` once the shape was settled (now done — the
  migration itself is still the one step you run, per "One step still
  needed" above).
- Nothing in `phase2/` was imported by anything in the live app tree, so
  `npm run build` for Phase 1 couldn't fail, slow down, or behave
  differently because of work happening there.

Wiring in — done now — meant moving/adapting those files into the real
`app/`/`actions/`/`lib`/`components/` trees, writing the real schema
(migration still pending), and adding navigation links behind a flag, all
as this one reviewed change rather than an automatic side effect of files
existing in the old folder.

## How we got here

The sections below are the evaluation trail, kept because the reasoning
still matters (and because "why not BuddyPunch" will come up again). Skip to
"Verified: getting TimeTrex CE actually running" for the current, load-bearing
findings.

### What I found out about the BuddyPunch API (and what I couldn't)

Checked BuddyPunch's own docs before writing anything. Findings, and where
they contradict each other:

- **Auth**: API-key based (not OAuth), created by an account admin under
  Settings → Integrations → Developer API → "Manage API Keys." Keys can be
  scoped Read and/or Write per resource. The key is shown once at creation —
  standard practice, store it as an environment variable / secret, not in
  the repo.
- **Plan tier — the docs disagree with each other**:
  - The "Getting Started with the Developer API" help article says API
    access ships on the **Pro or Advanced** plan (self-serve — just enable it
    and generate a key).
  - The older "API Instructions" help article says you must be on an
    **Enterprise plan**, and access requires manual approval from BuddyPunch.
  - The pricing page corroborates the newer story: Pro lists "Connect Buddy
    Punch to your other tools via our API," Advanced lists "Higher API & MCP
    limits." No mention of Enterprise-only gating there.
  - Best guess: the Enterprise/approval article is stale, describing an older
    version of their API program, and Pro/Advanced + self-serve key is
    current — but this needs confirming against your actual account, not
    assumed.
- **Endpoint reference**: lives at a login-gated developer portal
  (`developers.buddypunch.com`, backed by Azure API Management, technical
  docs at `api2.buddypunch.com/docs/`). It's a JavaScript-rendered app —
  nothing in it is visible to a logged-out fetch, so I cannot enumerate the
  actual endpoints, request/response shapes, rate limits, or webhook support
  from here. This is the real blocker.
- **Webhooks**: mentioned as a doc topic ("authentication, endpoints, error
  handling, webhooks, and code examples") but no detail visible without
  login. Whether BuddyPunch can *push* a punch event to us in real time, or
  we'd have to poll, materially changes the sync design below — need this
  confirmed before committing to an architecture.
- **Rate limits**: not published anywhere public; Advanced plan implies
  Pro's limits are lower ("Higher API & MCP Limits" as an Advanced-only
  perk), but no numbers found.

This was the plan if BuddyPunch had been the route taken: start a trial or
confirm the existing plan tier, check Settings → Integrations → Developer
API for self-serve access, generate a scoped key, and get the real endpoint
reference visible (it renders only when logged in). Moot now given the
direction below, but worth keeping in mind if TimeTrex CE's hosting turns
out to be more trouble than it's worth in practice — this is the fallback.

### TimeTrex Community Edition — a self-hosted alternative

You asked me to look at "TimeTrek API, community edition, self-hosted." I
couldn't find any product called TimeTrek that matches that description —
there's a small personal Mac desktop time-clock utility by that name
([gieson.com](https://www.gieson.com/Library/projects/utilities/timetrek/)),
but nothing self-hosted, nothing with an API, nothing with a "Community
Edition." What matches every part of the description — self-hosted,
Community Edition, an API — is almost certainly **TimeTrex**, a genuinely
open-source (AGPL-3.0) workforce-management suite that's been around for
years. Flagging the name mismatch rather than silently assuming, but I did
go ahead and research TimeTrex on that assumption since it fits so well.

Unlike BuddyPunch, this one I could actually read the source of — no gated
portal:

- **What it is**: a self-hosted PHP application (Community Edition, source
  mirrored on GitHub — [aydancoskun/timetrex-community-edition](https://github.com/aydancoskun/timetrex-community-edition)
  — and on a Gitea mirror at [git.solidcharity.com/SolidCharity/TimeTrex](https://git.solidcharity.com/SolidCharity/TimeTrex),
  currently v16.2). Covers time & attendance, payroll, and — per TimeTrex's
  own [scheduling product page](https://www.timetrex.com/open-source-workforce-management-software/open-source-employee-scheduling-software) —
  scheduling. **Not confirmed**: whether scheduling is fully present in the
  free Community Edition specifically, or partly gated to their paid
  Professional/Corporate/Enterprise tiers — TimeTrex's own pages reference
  those tiers without a clear feature-by-tier breakdown. Would need an actual
  install to verify.
- **License**: AGPL-3.0. Worth knowing about, not necessarily a blocker — it
  mainly obligates sharing source if *TimeTrex itself* is modified and
  offered to others over a network; a separate app (like JFY) merely calling
  its API as a client isn't the same thing as modifying and redistributing
  TimeTrex.
- **Stack**: PHP + **PostgreSQL** (confirmed from its example config file) —
  same database engine JFY already runs on Railway, though this would still
  be a fully separate application and database, not something that merges
  into JFY's existing Postgres/Prisma setup.
- **Two APIs, and they are not equivalent**:
  - A **SOAP API** with real, working example client code
    ([api/soap/api_client_example.php](https://raw.githubusercontent.com/aydancoskun/timetrex-community-edition/master/api/soap/api_client_example.php)):
    `registerAPIKey()` for auth, then `getUser()`/`setUser()` (employee
    records), `setPunch()` (clock punches — takes `user_id`, punch type,
    in/out status, timestamp, department/job), `getUserDefault()` (new-hire
    template values), and `getTemplate()` /
    `getTimesheetSummaryReport()` for reporting. This reads like the
    actual intended integration surface — documented by working example,
    key-based auth, sensible method names.
  - A **JSON API** that turned out to be the internal AJAX API TimeTrex's
    own web UI runs on (`api.php?Class=...&Method=...`, PHP-session +
    CSRF-token authenticated) rather than a designed-for-outsiders REST API.
    Usable in principle, but it's not built or documented for third-party
    integration the way the SOAP API is — the SOAP API is the one to build
    against.
  - No webhook support found anywhere in what I could read — punches/schedule
    changes would need to be polled, not pushed. Worth confirming against a
    real instance rather than taking that as final.
- **Hosting reality**: nothing to sign up for, no plan-tier ambiguity, no
  gated docs — but "self-hosted" means the shop is now also responsible for
  running and keeping a second, separate application (PHP runtime + its own
  Postgres database) up, patched, and backed up. That's real operational
  weight compared to BuddyPunch's "someone else runs it" model, and it's
  worth weighing against BuddyPunch's own reliability, given the whole point
  of Phase 2 is escaping *Homebase's* reliability problems — a
  self-hosted app is only as reliable as whoever's running it.

### BuddyPunch vs. TimeTrex CE, side by side

| | BuddyPunch | TimeTrex Community Edition |
|---|---|---|
| Hosting | Their SaaS — nothing to run | Self-hosted — you run the PHP+Postgres app |
| Cost | Per-user/month (Pro/Advanced for API) | Free (Community Edition), AGPL-3.0 |
| API access | Unconfirmed — docs contradict each other on plan tier, portal is gated | Open — SOAP API readable right now, no account needed |
| API documented? | Not from outside an account | Yes, via working example code in the public repo |
| Webhooks (push updates) | Unconfirmed | Not found — likely polling only |
| Scheduling in the free tier | N/A (paid product) | Unconfirmed — may be tier-gated even within TimeTrex's own pricing |
| Ongoing maintenance burden | None (SaaS) | Real — patching, backups, uptime are now your problem |

**Update — actually verified this, not just read about it.** I cloned the
real Community Edition source into a scratch environment and read the
gating logic directly rather than relying on marketing pages. Concrete
finding, with file/line references:

- `getTTProductEdition()` (`includes/global.inc.php:378`) doesn't check a
  license key at all — it checks whether certain **source files exist on
  disk**: if `classes/modules/expense/UserExpenseFactory.class.php` exists
  → Enterprise; else if `classes/modules/job/JobFactory.class.php` exists →
  Corporate; else if `classes/modules/time_clock/TimeClock.class.php`
  exists → Professional; else → **Community**. None of those three files
  exist in the public Community Edition checkout, so a self-hosted CE
  instance is hard-capped at Community — there's no config setting or
  license key that raises it; you'd need TimeTrex's paid-tier codebase,
  which isn't public.
- **Scheduling is gated to Corporate and above.** `ScheduleListFactory` and
  `ScheduleFactory` (`classes/modules/schedule/`) check
  `getTTProductEdition() >= TT_PRODUCT_CORPORATE` at ~15 separate points
  covering the actual list/search/mass-schedule operations; the schedule
  API (`APISchedule.class.php:790`) gates its own core logic at
  `>= TT_PRODUCT_PROFESSIONAL`. The Community-specific branch that does
  exist (`ScheduleFactory.class.php:1097`) only skips unassigned
  placeholder rows during processing — it's a minor filter, not usable
  scheduling. **Net: the Scheduling module's UI/view files ship in the
  Community Edition source tree, but the functionality behind them doesn't
  work at the Community tier.** This is the opposite of "unconfirmed" —
  it's now a confirmed no.
- **Timeclock (punches) is genuinely free at Community tier**, by contrast.
  `PunchFactory.class.php` and the SOAP/REST API's `APIPunch.class.php` /
  `APIUser.class.php` have no edition gating on core punch in/out or
  employee-record operations — only two minor advanced behaviors in
  `PunchFactory` are Corporate-gated. So the *timeclock* half of "replace
  Homebase" is realistic on Community Edition; the *scheduling* half isn't.

(One nuance: TimeTrex's public pricing page markets "Efficient Employee
Scheduling" starting at their **Professional** tier, not Corporate — so some
scheduling capability may unlock a step earlier than the Corporate-gated
code paths above suggest, with fuller functionality at Corporate. Doesn't
change the conclusion though: Professional itself requires their paid
codebase — the `time_clock/TimeClock.class.php` marker file that isn't in
the public Community Edition download — so it's not reachable by
self-hosting the free version either way.)

Homebase does both scheduling and timeclock; TimeTrex CE alone can only
honestly replace the timeclock half. Getting scheduling out of TimeTrex
means paying for their Professional tier ($5/employee/month, 10-employee
minimum, 1-year commitment per their pricing page) — at that point it's
priced against just paying BuddyPunch, not a "free and self-hosted" win.

**Decision: split the tools.** Self-host TimeTrex CE for timeclock only
(free, no recurring cost); build scheduling natively inside JFY (its own
tables/actions in the existing Prisma schema, no vendor). Both still surface
through one UI for staff — the split is invisible to them, it's purely a
backend decision. Reasoning: no new recurring vendor bill, and the piece
staff will look at most (their schedule) stays fully under our control
rather than living in a rented tier.

## Verified: getting TimeTrex CE actually running

Rather than stop at reading the source, I cloned TimeTrex CE into a scratch
Linux environment with PHP 8.4 and a real Postgres instance and actually
tried to install it — composer install, config file, schema creation, the
works. Concrete results, since this directly de-risks (or doesn't) the
self-hosting half of the decision above:

- **Composer install works cleanly on PHP 8.4** — all 15 dependencies
  (PEAR packages, TCPDF, htmlpurifier, etc.) installed with no platform
  conflicts, no `--ignore-platform-reqs` needed.
- **But TimeTrex's own version check disagrees.** `Install::checkPHPVersion()`
  (`classes/modules/install/Install.class.php:964`) hard-codes a supported
  range of **PHP 7.2.0 – 8.0.99** and explicitly flags anything newer as
  `2` (`UnSupported`). That's a real ceiling to plan hosting around — it
  doesn't mean the app is broken on newer PHP (see next point), but it
  means deliberately pinning an old PHP version in whatever container runs
  this, not just using "whatever Railway's default PHP buildpack ships
  today."
- **In practice, PHP 8.4 didn't break basic bootstrap.** Loading TimeTrex's
  core (`global.inc.php`), instantiating its install/database classes, and
  connecting to a live Postgres database (via its ADOdb layer) all worked
  without a single fatal error — better than the stated 8.0.99 ceiling
  would suggest. One real PHP-8 deprecation surfaced (an `explode()`/`list()`
  pattern that assumes 2 array elements and warns instead when it gets
  fewer) — cosmetic, not fatal, but a sign there's probably more like it
  scattered through 90-plus schema-migration files and years-old code.
- **Schema installation needs the PHP `soap` extension — even just to set
  up the database**, not only for the API. My scratch environment didn't
  have it and (in that specific sandbox) I couldn't install it — no apt
  access to the standard package, and building the extension from source
  hit a missing `libxml2` development-headers package I also couldn't
  install. This is a normal, well-documented requirement on any real
  Linux box or Docker image with proper package access (Debian:
  `apt install php-soap`; Docker: `docker-php-ext-install soap` after
  `apt-get install libxml2-dev`) — it's not a TimeTrex problem, it's a
  "this particular disposable test environment had restricted package
  access" problem. But it means I could **not** complete a full schema
  install or a live SOAP API round-trip (`registerAPIKey` → `setPunch`) in
  this pass — that's still unverified against a real running instance,
  only against the source code.
- **Net for hosting on Railway**: realistic, but not a drop-in "deploy this
  folder" — needs a Docker image pinned to an older PHP (8.0.x is the
  officially supported ceiling; the untested-but-promising middle ground
  would be trying 8.1/8.2 for a smaller version gap, given 8.4 didn't
  fatal-error on what I could reach) with `ext-soap` and its `libxml2`
  build dependency explicitly installed, plus its own Postgres database
  (a second Railway Postgres service, separate from JFY's).

## Reconsidered: is TimeTrex CE worth it at all?

After the hands-on install attempt above surfaced real complexity (old-PHP
pin, `ext-soap`/`libxml2-dev` as hard build dependencies, a second Postgres
service), you asked the right follow-up: *is the limited API useful enough
to justify this over building it ourselves and keeping everything local,
especially running significantly older PHP?* This section is that
investigation, and it reverses the "split the tools" decision above.

**What I checked**: whether TimeTrex CE's core payroll/hours engine —
`CalculatePolicy.class.php` (punches → daily/weekly totals with overtime),
`PremiumPolicyFactory`, `UserDateTotalFactory`/`UserDateTotalListFactory`,
`PunchFactory`/`PunchControlFactory`/`PunchListFactory`, and the policy
definition classes (`OverTimePolicyFactory`, `RegularTimePolicyFactory`,
`AbsencePolicyFactory`, `HolidayPolicyFactory`, `BreakPolicyFactory`,
`MealPolicyFactory`, `AccrualPolicyFactory`, `RoundIntervalPolicyFactory`,
`PolicyGroupFactory`) — is gated to paid tiers the same way Scheduling was,
or actually usable at Community tier.

**Finding: it's genuinely open, but only for what JFY doesn't need.** Every
`getTTProductEdition()` gate found across these files — dozens of them —
gates one of two things, consistently:

- **Job costing.** Assigning a `Job`/`JobItem`/Task to a punch or an hours
  record, for billing/costing purposes (`PunchFactory::setJob()`,
  `PunchControlFactory`, `UserDateTotalFactory::setJob()`, the "Job"/"Task"
  columns in punch list views) — all `<= TT_PRODUCT_PROFESSIONAL` zeroes the
  value out, or `>= TT_PRODUCT_CORPORATE` gates the feature entirely. This
  is a real, deliberate paid-tier feature; it's also not something a
  formalwear alterations shop's timeclock needs.
- **Advanced branch/department/job-group-scoped targeting** for premium and
  overtime policies (`PremiumPolicyFactory::getJobGroup()`/`setJobGroup()`,
  the branch/department scoping in `PremiumPolicyBranchFactory`/
  `PremiumPolicyDepartmentFactory`, strict job validation on punches).

**What's *not* gated at all**: `OverTimePolicyFactory`,
`RegularTimePolicyFactory`, `AbsencePolicyFactory`, `HolidayPolicyFactory`,
`BreakPolicyFactory`, `MealPolicyFactory`, and `PolicyGroupFactory` — the
actual policy *definitions* that drive overtime thresholds, holiday pay,
absence handling, and break/meal rules — have **zero** `TT_PRODUCT` gates.
Same for basic punch in/out and the core hours-totaling math in
`CalculatePolicy`. So TimeTrex CE's core engine is real, not a crippled
demo — it's just that its actual moat (job costing) is aimed at businesses
billing hours to clients/projects, not at a shop just paying hourly staff.

**Given that, three things tip this toward building natively instead:**

1. **The thing TimeTrex CE isn't gating is also the easy part.** A flat
   ">40 hrs/week = overtime" calculation (the standard federal rule, and the
   likely fit for a small shop unless there's a specific state daily-OT or
   accrual requirement I don't know about) is a punch table plus a
   straightforward aggregation query — not the kind of complex, easy-to-get-
   wrong logic that would justify taking on someone else's PHP app to get
   right. If JFY's actual rules turn out to need jurisdiction-specific daily
   OT tiers or PTO-accrual milestones later, that can be added natively
   incrementally — it doesn't require having adopted TimeTrex up front.
2. **The operational cost is confirmed, not hypothetical.** Old-PHP pin
   (7.2–8.0.99 officially, with real PHP-8 deprecation warnings already
   found), `ext-soap` + `libxml2-dev` as build-time hard requirements, a
   second Postgres service, a second Railway service to deploy/monitor/back
   up, an AGPL-3.0 codebase pulled from an unofficial GitHub mirror (not
   TimeTrex's own repo) with no vendor patch path, and no webhook support
   anywhere found — punches would have to be polled, not pushed.
3. **It re-introduces the failure mode you're trying to escape.** Homebase's
   problem, as described, is lag and unreliable timeclock records — i.e.,
   exactly the symptom you'd expect from a network hop between "the app
   staff use" and "the system of record for punches." Self-hosting TimeTrex
   CE keeps that same shape (JFY UI → SOAP call → separate PHP app → separate
   Postgres) just with you running both ends instead of a vendor running one.
   A native `Punch` table removes that hop entirely — clocking in writes
   directly to the same database everything else in JFY already lives in,
   with the same transaction/audit-log patterns Phase 1 already established.

**Decision: drop TimeTrex CE entirely.** Build both timeclock and
scheduling natively. This supersedes "Decision: split the tools." above —
that decision was made before the core-engine gating was checked, on the
assumption that self-hosting TimeTrex bought something hard to build
correctly; it turns out what it buys (job costing, advanced targeting)
isn't needed, and what's needed (punch capture + basic overtime totals)
isn't particularly hard to build directly. One caveat worth flagging: this
assumes JFY's actual overtime/PTO rules are close to the simple federal
default. If there's a specific jurisdictional wrinkle (daily overtime,
7th-consecutive-day rules, mandated meal-break penalties, PTO accrual
schedules) that needs to be exactly right, that's still buildable natively —
it just deserves its own design pass rather than being assumed away here.

## Due diligence: checked the wider market too, not just TimeTrex

You pushed back on the native-build call — fairly: timeclock/scheduling/
payroll is genuinely a "0 room for error" category, so before committing to
building it, it's worth checking whether a proven, already-built system
beats a custom one on reliability, not just on features. Widened the
research past TimeTrex CE to the actual market: modern hosted competitors
(Deputy, 7shifts), Homebase's own API (since it exists, even though the
whole point is escaping it), and modern open-source alternatives to
TimeTrex.

**Modern SaaS competitors have API access, but not a cleaner reliability
story.**

- **Deputy**: real API (OAuth2 + tokens, decent docs), but an independent
  API report card grades it A+ on *coverage* while separately documenting
  "inconsistent" webhook delivery with missed events (needs polling as a
  fallback anyway) and "payroll synchronization glitches with Xero and
  Paycom." $5–9/employee/month depending on tier.
- **7shifts**: the most genuinely well-built API of anything checked —
  OAuth2, documented rate limits (10 req/sec), real `/schedules` and
  `/time_punches` endpoints, working webhooks. But API access is
  plan-gated (roughly their two higher tiers), and pricing runs
  $79.99–$134.99 **per location**/month plus per-employee add-ons for
  payroll — comparable to or more than TimeTrex's paid tiers for a
  single-location shop, and still a live, ongoing vendor dependency with a
  monthly bill.
- **Homebase's own API**: exists, but Enterprise-tier only (no self-serve
  access, negotiated with sales), and the same independent report flagged
  real reliability problems with it directly — "failures to pay federal
  payroll taxes on time, with IRS-assessed penalties," "unauthorized
  withdrawals... followed by long delays," and POS-data sync drift. This is
  useful confirmation, not a surprise: it's evidence for *why* you're
  leaving Homebase, and a reason not to route around the UI problem while
  keeping Homebase as the backend.
- **Open-source alternatives to TimeTrex**: checked whether something more
  modern exists. Kimai is the most actively-maintained open-source
  time-tracking tool out there, but it's time-tracking only — no
  employee-scheduling/shift-planning module at all, so it can't replace
  Homebase's scheduling half either way. Surveying the open-source
  landscape more broadly turned up nothing that combines scheduling +
  timeclock + payroll in one free, self-hosted system except TimeTrex CE —
  every other option is missing at least one of those three pieces
  (Staffjoy has timeclock but no payroll; Open HRMS has payroll but no
  timeclock). TimeTrex CE's uniqueness in that niche is real; it's also why
  it's carrying 20-year-old PHP-era baggage no one has replaced it with.

**The pattern that actually matters: every option carries the same kind of
risk you're trying to escape, not a cleaner one.** Homebase, Deputy, and
TimeTrex CE all turned up documented reliability problems in this pass —
sync drift, inconsistent webhooks, payroll reconciliation glitches, an
unsupported PHP ceiling. Buying a name-brand system doesn't turn out to buy
freedom from "the software occasionally messes up records"; every system
here is still just a computer program with bugs and edge cases. What buying
one *does* trade away is control and visibility — when a punch looks wrong,
a black-box vendor (or someone else's 20-year-old PHP codebase) is much
harder to debug and fix than code sitting in the same repo as Phase 1,
using the same transaction/audit-log patterns already proven out there.

**On the actual compliance risk** (the real reason to be cautious here):
the specific things that make timekeeping "0 room for error" — overtime
must be computed per calendar workweek regardless of pay period, the
"regular rate" used for overtime must include certain bonuses/commissions
if any exist, short rest breaks (≤20 min) count as compensable hours
worked, an unpaid meal period must be genuinely duty-free, and records must
be kept for years — are federal (FLSA) rules that apply no matter what
software is used. None of the vendors checked (Deputy, 7shifts, TimeTrex,
Homebase) enforce these as some kind of built-in compliance guarantee —
they're configurable time/pay calculators, same as a native build would
be, and the liability for getting the config right sits with the employer
either way. So the compliance risk is a reason to build the calculation
logic carefully and get it reviewed (ideally by whoever already handles
payroll for the shop, e.g. an accountant or payroll processor), not
inherently a reason to prefer someone else's software over JFY's own.

**Net: the due diligence reinforces the native-build call rather than
reversing it.** Nothing in the wider market is meaningfully more reliable
than what a careful native build in the existing, already-audited
Prisma/Postgres stack would be — every alternative adds a recurring vendor
bill or hosting burden without buying out the actual risk. The one
open follow-up worth confirming before writing the overtime/hours logic:
how payroll actually gets run today (in-house, an accountant, a payroll
processor like Gusto/ADP/QuickBooks) — whoever reviews hours before pay
goes out is the real backstop on getting this right, and it's worth having
them sanity-check the computed totals early rather than only at the end.

## Open design questions

The data model, correction/audit model, and scheduling model questions that
were open here are now resolved by the "Built so far" section above — the
`Punch`/`Shift` shapes, the manager-only correction path, and the
draft/publish scheduling flow are all built. What's still open:

- **Overtime/absence rules — what does JFY actually need?** This is the one
  blocking question before the calculation layer grows beyond plain hours
  totals. `phase2/lib/hours.ts` currently computes worked time only — no
  overtime multiplier, no holiday pay, no accrual. Once how payroll runs
  today is confirmed, this is where that logic gets added (see the scope
  note in "Status" above).
- **How punches actually get captured day to day**: a kiosk-style shared
  device at the front counter vs. each staff member's own phone/JFY login.
  `ClockPad` works either way (it just needs a signed-in session), but which
  one is realistic changes whether "who's clocking in as whom" needs any
  extra safeguard beyond the existing PIN login.
- **Sequencing**: both halves got a first pass built together this round
  rather than strictly sequenced, since neither turned out to be
  substantially bigger than the other once payroll math was taken off the
  table. Worth deciding what to actually try first in practice (e.g. have
  one or two staff pilot the timeclock for a week before rolling out
  scheduling too).

## Non-goals for this pass

- Not touching Phase 1's `User`/session model or routes — Phase 2 only adds
  new relation fields to `User` and two new tables, nothing existing changed
  shape.
- TimeTrex Community Edition is no longer part of the plan — the scratch
  install/source investigation was exploratory and is not being carried
  forward. Nothing about it needs cleanup in the live app since it was never
  wired in; the scratch clone used for investigation lived outside this
  repo (`/tmp`), not under `phase2/`.
- Not yet built: any pay rate, overtime multiplier, or payroll export logic
  — deliberately deferred, see "Status" above.
- Not yet done: the actual Prisma migration against a real database — see
  "One step still needed" above. Everything else (schema edit, file moves,
  nav links, the flag) is done.
