# Apex Property — build log

Every build bumps the version by 0.1 in **both** repositories, and the admin
dashboard shows the two side by side.

The number exists so a bug report can be checked against a build. "That was
fixed" and "it is still broken" are both easy to say and, until now, impossible
to reconcile: the two halves deploy separately, and a backend can sit days
behind its frontend with nothing on screen saying so. Every symptom then reads
as a new bug rather than an old one that was fixed but never deployed.

Check the running build at **Admin → Business & data dashboard**, or hit
`/api/version` directly — that one needs no login, because the times you most
need it include the times nobody can sign in.

---

## v4.0 — 2026-08-17

**A feature suite: every feature driven the way a person drives it**

17 tests covering what the layout and auth suites do not — that a filter
filters, a wish list saves, an admin can create a user, and that every admin
key form explains a bad input instead of answering 500.

**12 passing, 2 skipped, 3 failing — and the 3 are one unresolved question.**

*Confirmed working:* district → suburb narrowing (the bug that took six
releases), underpriced, subdividable, wish list creation, the admin user list,
the promoter list with its link and earnings, pause/resume, the maps key form
refusing a bad key with a reason, the data probe explaining a missing LINZ key,
the bug log, and the version pair on the admin dashboard.

*Fixed on the way:* three Postgres-only `::` casts in the dashboards router
(`created_at::date`, two `(x IS NOT NULL)::int`, and two `'x'::text`) replaced
with standard `CAST(...)` and `CASE WHEN`, so those parts run on any engine.

*Still Postgres-only, and now precisely located:* `/api/dashboards/suburb-trend`
uses `PERCENTILE_CONT ... WITHIN GROUP`, exactly like the market pulse did. It
500s on SQLite, works in production, and cannot be exercised by a test until it
gets the same portable fallback the pulse got. The trends test now asserts the
page still renders rather than pretending the backend is portable.

**Unresolved, and stated plainly:** the /properties table renders **no rows**
against the seeded data, while `GET /api/properties` returns **7** for the exact
query the table makes. Same origin, same parameters, no 5xx. That is either a
gap in the seed or a real rendering fault, and I have not determined which — so
three tests are left failing rather than quietly weakened to pass.

Backend: 613. Browser: 96 layout + 12 features + auth/promoter.

## v3.9 — 2026-08-17

**Measured why it is hard to use on a phone, and fixed most of it**

v3.8 proved the pages do not scroll sideways. That is not the same as usable —
a page with 13px inputs, 21px-tall fields and 9.5px labels passes it
comfortably. So `e2e/mobile-audit.spec.ts` now MEASURES the things that
actually make a phone unpleasant, on every page at 390px, and reports numbers
rather than a pass.

| | before | after |
|---|---|---|
| inputs that make **iOS zoom the page** | **72** | **2** |
| tap targets under 44px | 309 | 244 |
| text under 13px | 79 | 79 |

**The big one: every field in the app was 13–15px.** Below 16px, iOS Safari
zooms the entire page the moment a field is focused and leaves you at ~1.3x with
no obvious way back — you then pan the whole layout to reach the next field. On
a page of filters that is the difference between using the site on a phone and
giving up on it. Now 16px, with a 44px minimum height, so filter fields are
something you tap rather than aim at.

It needed `!important`: most fields here carry an inline `style={{ fontSize }}`,
which beats any stylesheet rule. The first attempt without it moved 72 to 65 and
looked like it had worked.

**Still outstanding, and I am not claiming otherwise:** the 79 pieces of text
under 13px did not move. They are inline styles too, and unlike the fields there
is no single selector that reaches them — each is a per-component edit. The
worst are on the trends page: "Sales this month" and "Median days to sell" at
**9.5px**. The audit prints every one with its text, so the list is the work.

244 tap targets are still under 44px, mostly nav links at 224x40 — four pixels
short and low-risk — and inline text buttons like "Sign out" at 48x17, which is
a real miss.

Re-ran the phone layout suite afterwards: 40 passed, no regressions from the
taller controls.

## v3.8 — 2026-08-16

**Responsive tests at phone and tablet — and the honest result**

80 layout checks: every view at **390px** (iPhone), **360px** (common Android),
**820px** (iPad portrait) and **1180px** (iPad landscape). Public pages, all
eight customer pages, all eight admin pages, the promoter dashboard on each of
its three tabs, and a property page.

**75 of 80 passed.** The layouts are in better shape than they look — two real
faults, and both are now fixed.

**The logo overflowed a narrow phone.** The lockup is roughly 10:1, so at
`size={36}` it wants 367px — wider than a 360px screen — and `flex: none`
stopped it shrinking. That pushed the whole sign-up page sideways. It now scales
down to the room available, keeping its aspect ratio, and the same fix is
applied to the real artwork path so dropping in a logo file cannot reintroduce
it.

**The phone menu button was labelled "Overview".** The hamburger — the only way
to navigate the app on a phone — carried the nav GROUP heading as its
`aria-label`. Anyone using a screen reader was hunting for a menu that announced
itself as something else entirely. Now "Open menu", in all six languages.

The check that catches this class of fault is horizontal overflow: one element
wider than the screen makes the entire page scroll sideways and every other
element drift out of alignment. It is invisible on a laptop, which is why it
survives to the phone. When it fails, the message names the offending element
and how far past the edge it reaches, because "the page overflows" is not
something anyone can act on.

**Also found, not fixed:** `/api/dashboards/suburb-trend` 500s on SQLite —
another Postgres-only query, like the market pulse was. Production is Postgres
so it works there, but suburb trends cannot be exercised locally or in a test.
Same class of problem, worth the same treatment; say the word.

Total: **613 backend + 98 browser**.

## v3.7 — 2026-08-16

**Browser tests — and three real bugs found by writing them**

Every one of the 613 backend tests passes against the API. None of them opens a
browser, which is why a bug that made the promoter dashboard unusable survived
five builds. There is now a Playwright suite that drives the **real stack**: a
real FastAPI server on a seeded database, the real Next.js production build in
front of it, and a real Chromium obeying real redirects. 18 tests, `npm run e2e`.

Writing them found three things.

**A promoter navigating to any customer page landed on the paywall.** Fixed in
v3.5 for the background poll, but a page's own data fetch does the same thing: it
402s, and the 402 handler sent them to `/onboarding`. `api()` now routes a 402 by
**role** — a promoter goes to their own dashboard, because they are not buying
the product and a card form is never their next step.

**BACKEND_ORIGIN is a BUILD-time variable, not a runtime one.** Next resolves
`next.config.js` rewrites during `next build` and writes the destination into
`.next/routes-manifest.json`. Setting it at runtime does nothing — the app
proxies to whatever was baked in. Ours defaults to the production backend, so
this is silent and correct today and a trap the moment there is a staging
environment: the staging frontend would talk to production with no error
anywhere. Found because the tests pointed at production instead of the local
server.

**The market pulse never ran outside production.** `PERCENTILE_DISC ... WITHIN
GROUP` is Postgres-only; on SQLite the query raised a syntax error that was
caught and logged, so the Today brief's pulse was empty in every test and every
local run. Production is Postgres so nothing looked broken — which is the
problem, because it meant no change to that number could ever be verified before
shipping. There is now a portable path that returns the same discrete median,
and a test asserting the median is the middle listing rather than an average.

**Also:** the all-properties map refit to `maxZoom: 14` while suburb trends used
15, so choosing a suburb landed a whole zoom level wider on one page than the
other. Reported back in v1.8 as "the map doesn't move like it does with suburb
trends". Now both are 15.

Total: **613 backend + 18 browser**.

## v3.6 — 2026-08-16

**The promoter dashboard leads with the two numbers they came for**

Income and paying customers, at the top, before the link and the funnel. Both
were on the page already, sitting below both — and a promoter opens this to
answer two questions, so every second spent hunting for them is a second spent
wondering whether the answer is being hidden.

- **Your income** — the monthly run rate, large, with earned all-time and
  awaiting-payout underneath it.
- **Paying customers** — the count, the rate each, and the trial count kept
  beneath it still labelled *earns nothing until their first payment*.

The four-stat strip that used to carry these is gone rather than left to repeat
them, and the now-unused component with it.

## v3.5 — 2026-08-16

**The 401s, and a serious bug they were hiding**

The 401s in the Railway log are mostly the app working — a signed-out browser
loads a page, `/api/auth/me` answers 401, the frontend routes to sign-in. Nothing
files them as bugs: both the frontend reporter and the backend handler already
filter to 5xx only, deliberately, because burying real faults under expired
tokens is how a bug log becomes useless.

But looking at why there were *so many* turned up three things worth fixing.

**A promoter's dashboard bounced them to the paywall.** The match-alert badge in
the header polls `/api/wishlists/notifications` every 60 seconds. Wish lists sit
behind the paywall, a promoter has no product access, so it answers **402** — and
the 402 handler redirects to `/onboarding`. A promoter opened their own
dashboard and was thrown to a card form about a second later. Shipped in v3.0
and made the whole promoter view unusable. The poll is now off for promoters.

**A background poll could throw anyone off the page they were reading.** That
same poll runs behind whatever you are doing, and on 401 it cleared the token
and redirected. Leave a tab open past the token's life and you were dropped on
the sign-in page mid-sentence, by a request you never made. `api()` now takes a
`background` flag that suppresses both redirects; the next thing you actually
click will still route you correctly, which is the right moment for it.

**Sessions lasted one hour.** Nothing refreshes a token, so `jwt_expiry_minutes`
was the entire session — leave for lunch, come back signed out, and every
background poll after the hour mark logged another 401. Now **12 hours**, a
working day for a tool people research in across an afternoon. Override with
`JWT_EXPIRY_MINUTES` if you want it tighter.

401 and 402 stay strictly separate, and there are now tests holding that line:
one means "sign in", the other means "you are signed in and this costs money".
Collapsing them sends a paying customer to a login screen.

## v3.4 — 2026-08-16

**Admin → Data probe: type an address, see what the free sources actually hold**

Built to settle one procurement question with data instead of recollection —
what do we get for nothing, and what do we have to buy.

Type an address (or a lat, lng). It asks every free LINZ layer — Addresses,
Primary Parcels, Property Titles, Building Outlines — what it holds for that
property, and prints **every field each one returns**, not a curated selection.
The useful discovery is the field nobody expected; a probe that only reports
what someone already thought of cannot make one. It then scores the result
against the nine inputs the pricing model takes and tells you how many are free.

It runs server-side, for the same two reasons the parcel lookup does: the LINZ
key is a secret that would be readable in a browser bundle, and LINZ does not
promise CORS headers to arbitrary origins.

**Three things it refuses to do:**
- With no key set, it answers **422 with a sentence you can act on** — where to
  get one, and that it is the Data Service key rather than the Basemaps one —
  instead of a 500 or a silent empty result.
- If nothing answers, it prints **no scorecard at all**. Nine red crosses drawn
  from four failed requests reads as "none of this is available free", which is
  the opposite of what it means.
- It never claims a field is absent when the layer simply was not reached.

Also shipped: `probe_linz.py` at the repo root — the same thing as a standalone
CLI, standard library only, no install, for running against a key on a laptop
before it goes anywhere near Railway.

## v3.3 — 2026-08-16

**Tested the referral programme properly, and found two real bugs**

A second suite that goes underneath the API — the Stripe webhook handler, the ad
generator's parsing, the date arithmetic, and the places where two numbers on the
same screen are worked out two different ways and can therefore disagree. 84
checks, and two of them failed on shipped code.

**Fixed — a promoter could see two different figures for the same money.** The
per-customer rows and the per-ad breakdown both worked earnings out as
`months × the promoter's CURRENT rate`, while the headline total summed what was
actually recorded in the ledger. Identical while a rate has never changed, and
wrong the moment one does: after a rate change from $20 to $35 the row read
$105 and the total read $75, on the same screen. Both now sum the ledger. What
was earned at the old rate stays at the old rate, which is what was agreed.

**Fixed — two ad templates broke our own rule.** The media pack states "always
make it clear the trial needs a card and renews unless cancelled" — and the
Instagram/TikTok caption and the 30-second video script did not say it. Printing
a rule next to copy that ignores it is worse than not printing it. Both now say
it, and a test asserts every template does.

**What the new suite covers:** the `invoice.payment_succeeded` path end to end
(including a replayed webhook, an unknown customer, a malformed invoice, and an
invoice with no billing period); month arithmetic across year boundaries,
reversed dates and a 10-year period; the ad generator against clean JSON, JSON
buried in chat and a code fence, unparseable output, junk array entries, and a
model returning twenty drafts; that the system prompt actually carries the
prohibitions and the promoter's own link; the daily ad cap, and that Ask Ollie
questions do not count against it; click de-duplication across days; payouts
scoped to one promoter; the CSV's contents; and deleting a promoter who has
clicks but no earnings.

Full suite: 289 + 35 + 31 + 154 + 84 = **593 passing**.

## v3.2 — 2026-08-16

**Upload the ad pack once, every promoter has it**

Admin → Promoters → **Ad pack**. Images, logos, video, PDFs. Give each a title
and a note ("1080×1920, keep the top 250px clear") and it appears in every
promoter's Media pack immediately, with an inline preview for images and a
download button.

**The files live in the database, not on disk.** Railway wipes a container's
filesystem on every deploy, so a file written next to the app is gone the next
time anything ships — and it goes silently, with a promoter finding out by
clicking a download that 404s a week later. A row in Postgres survives deploys,
restarts and rollbacks and needs no second service.

That trade has a ceiling, so it is stated rather than hit: **20 MB a file**, and
anything bigger is added as a **link** instead. A brand video belongs on YouTube
or Drive; promoters get the same thing and the database stays a database. The
error you get for an oversized file says that, rather than just refusing with a
number. The admin panel also shows how much of the database the pack is using,
because nobody watches a number they cannot see.

**Downloads are behind the promoter gate**, not on a public URL — an unreleased
campaign image on a guessable link is out before it launches. That means the
inline previews fetch bytes with the auth header and hand the browser an object
URL, since a plain `<img src>` cannot carry a bearer token.

**Hide, don't delete.** Hiding pulls an item from every promoter's pack while
keeping it recoverable and still fetchable by an admin — so something pulled for
a legal reason can be checked and put back without re-uploading it. Delete is
there too, and says which one you are choosing.

30 more tests, 154 on the referral programme in total.

## v3.1 — 2026-08-16

**The promoter dashboard grows a funnel, a media pack, and an ad writer**

*Results — clicks through to paying.* Opening a promoter's link is now counted,
so the dashboard shows the whole chain: **opened → created an account → paying**,
with the conversion rate between each pair. Opens count *people*, not page loads
— a refresh does not add to it. And they are labelled as a guide rather than a
figure: browsers that block scripts are not counted and one person on a phone
and a laptop counts twice, so this is the one number on the page that cannot be
verified and it says so. A link nobody has opened shows a dash, not 0% — those
are different things and 0% reads as failure.

Nothing identifying is stored. No IP address, no user agent, no location — just
a random id the visitor's own browser made up, which is enough to tell one
person from two and useless for anything else.

*My ads — which post actually worked.* Tag a link (`&c=insta-reel-aug`) and the
tag rides along on the click and again on the signup, so each row is a real chain
from one ad to one paying customer. Two spellings of one ad name collapse into
one row. Untagged traffic is its own row rather than hidden, so the breakdown
adds up to the headline.

*Media pack.* What the product is in words we can stand behind, the brand
colours, logo downloads (they appear automatically once artwork is dropped into
`public/brand` — until then it says so rather than inviting someone to
screenshot the mark), and ready-made copy for six channels with their own link
already in it.

**And the rules, printed.** No guaranteed returns, no "financial advice", no
invented statistics, no implying a partnership with a company whose listings
appear, always disclose the paid referral. These go in the system prompt for
every generated ad *and* on the page, because a prohibition only the model can
see does nothing about a caption someone writes themselves — and on a property
site, "guaranteed returns" in an affiliate's post is our problem whoever typed
it.

*Ad writer.* Drafts three options for a chosen channel, against those rules,
using the account's shared Ask Ollie key. Capped at 15 a day per promoter —
much tighter than Ask Ollie, because this runs on the business's key and one
promoter with a free evening should not spend the whole allowance on captions.
The ready-made copy comes first on the page and needs no key: an influencer
blocked behind "AI is not switched on for this account" is an influencer who
posts nothing.

21 more tests, 124 on the referral programme in total.

## v3.0 — 2026-08-16

**Referral programme — influencers earn $20 a month per paying customer**

A promoter gets a link, and earns for as long as the people they bring in keep
paying.

*The rule everything else follows:* **commission is recorded when a customer's
invoice is PAID.** Not when they sign up, and not when they start a trial. It
hangs off Stripe's `invoice.payment_succeeded` — the one event that means money
actually moved. Three things fall out of that for free: a customer who cancels
stops earning with nothing to run and nothing to reconcile, a failed payment
earns nothing, and someone who pays for a year earns the promoter for all twelve
months rather than one, because the accrual reads the invoice's own period.

Paying $20 for a trial that never converts is paying out revenue that never
arrived, and at any volume that is the difference between a growth channel and a
leak.

**Who gets counted, and who does not**
- Attribution happens once, at account creation. A code presented at sign-in, or
  by somebody who already has an account, does nothing.
- `referrals.user_id` is unique in the database. That one constraint is the
  whole anti-double-counting rule: an account has exactly one referrer, forever.
  Two promoters cannot both claim the same customer.
- A promoter cannot refer themselves. An admin or another promoter cannot be
  counted as a customer.
- The code survives the journey: it is captured from whatever page carries
  `?ref=`, kept for 30 days, and used when an account is finally created. People
  do not sign up on the first screen they land on, and losing those is losing
  exactly the referrals a promoter worked for. First link wins — a later one
  cannot steal a signup someone else earned.

**A promoter is not a customer**
- Their account is created *approved* so they can sign in, and "approved" is the
  flag that otherwise waves an account straight past billing. Without an
  explicit rule every promoter would quietly hold a free copy of the paid
  product; `has_product_access` now refuses promoters before it checks status.
- They see no listings, and the paywall is not their next step — signing in
  takes them to their own dashboard rather than a card form.

**What each side sees**
- *Promoter:* their link, paying customers, what that is worth a month, earned
  all time, awaiting payout, and a row per referral. Trials are shown but kept
  visibly separate and never added into the total — a dashboard that counts a
  trial as a sale sets someone up to be disappointed on payout day.
  **No customer names or email addresses**, ever: a promoter needs to know how
  many customers they have and whether each is paying, not who they are.
- *Admin:* add promoters, per-promoter rates, pause a link, what is owed and
  what has been paid, mark a month paid, record a commission by hand when a
  webhook was missed, and a CSV a payout run actually works from.

**Rates**
- $20 a month is the default. Changing it applies to promoters signed *after*
  the change — an existing promoter keeps the rate they agreed to, because
  rewriting that retroactively and silently is not something this should be able
  to do by accident.

**Deleting accounts**
- A promoter with commission history cannot be deleted; deactivate instead.
  "We deleted the account so we cannot say what we owed you" is not a position to
  be in.

87 new tests cover this, most of them the refusals.

## v2.9 — 2026-08-16

**Aerial imagery no longer loads just because a listing was opened**
- The Sun & shade panel mounted as soon as a property page rendered, so opening
  a listing fetched Google tiles whether or not anyone scrolled down far enough
  to see the map. Most listing opens are a glance at the price and a back
  button; every one of those was billing for a photo nobody looked at.
- It now waits until the panel is scrolled near (300px of lead, so it is already
  there when you arrive rather than appearing as you watch). Once loaded it
  stays loaded — unmounting a map that scrolled off screen would re-fetch every
  tile when it scrolled back on.
- The location panel was already gated: it opens on Street and calls Google only
  when someone clicks Aerial.

Net effect, per person: browsing listings costs nothing, opening a listing costs
nothing, and imagery is requested only when someone actually looks at a map.

## v2.8 — 2026-08-16

**The maps key moves into the admin panel**
- **Admin → Map imagery.** Paste a Google key, save, done. It takes effect on
  the next page load.
- It was a `NEXT_PUBLIC_` build variable, which meant three things, all of them
  costly. Changing or rotating the key needed a rebuild and a full redeploy of
  the site. Setting the key without *also* setting `NEXT_PUBLIC_MAP_PROVIDER` to
  the matching name did nothing at all — indistinguishable from a key that does
  not work. And a `NEXT_PUBLIC_` variable is compiled into public JavaScript, so
  the key was downloadable by anyone who loaded the site, signed in or not.
- Now the key lives in the database, encrypted, and is handed to the browser
  only through `/api/config/maps`, which sits behind the same paywall as the
  listings. Someone has to be entitled to see a property before they can get the
  key that draws its photo. It still reaches the browser — the browser is what
  calls Google — so a domain restriction on the key is still what stops anyone
  else spending it, and the admin page says so in the setup steps.
- The panel also takes an optional LINZ Basemaps key, and a "which to use"
  selector that defaults to picking the sharpest key that is set. Naming a
  provider whose key is missing falls through to one that works rather than
  drawing a grey box.
- The old env vars still work as a fallback so local development needs no
  database. The dashboard wins where both are set.

**Where the cost actually falls**
- Imagery is requested on a **property page only** — never while browsing the
  listings, the map view or the trends pages, which run on free street tiles. So
  spend follows the listings people actually open.
- The location panel opens on **Street** and only calls Google when someone
  clicks **Aerial**, so opening a listing and scrolling past the map costs
  nothing.
- The tile session is minted once per browser tab, not once per listing.
- Tiles are billed per tile, so a panned-around aerial costs more than the one
  flat image the old path fetched. That is the trade for a photo that is sharp
  and can be moved. Set the source to Esri in the panel to stop all Google spend
  without deleting the key.

## v2.7 — 2026-08-16

**A sharper aerial view, and an aerial on the listing itself**
- The property page's location panel now has a **Street / Aerial** toggle. The
  street map answers "where is this"; the aerial answers what the street map
  cannot — how big the section actually is, what is on the back half, how the
  neighbour's roofline compares. That is the view people open a listing to see,
  so it is one click away rather than a different website.
- Google satellite is now served through the **Map Tiles API** rather than a
  single flat Static Maps image. Real tiles, streamed as you pan, requested at
  twice the screen's pixel density. The old static image was capped at 640x640
  logical pixels and then stretched across a ~900px panel on a retina screen —
  about a 1.4x enlargement, which is exactly what "not sharp" looked like. It
  also could not be panned or zoomed at all; now both work, out to zoom 22.
- Static Maps is kept as the fallback for when a tile session cannot be minted
  (API not enabled on the key, offline, a referrer restriction that does not
  cover the host). Every failure falls through to something that draws, because
  a slightly soft photo beats a grey rectangle.
- **A key is now the whole configuration step.** Imagery used to need the key
  AND `NEXT_PUBLIC_MAP_PROVIDER` naming the same provider; setting only the key
  silently changed nothing, which is indistinguishable from a key that does not
  work. The sharpest source with a key present now wins on its own, and the
  provider variable is only there to force one.

To turn it on: enable **Map Tiles API** and **Maps Static API** on one Google
Cloud key, restrict that key to the site's domains, and set
`NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Nothing else. Without a key the panels keep
working on the free Esri layer, just softer.

## v2.6 — 2026-08-16

**The suburb filter — the actual cause, found by using it**
- Choose a district, then choose a suburb that is not in it, and the page
  empties. Both filters are applied and no listing can satisfy both. Nothing on
  screen says the two disagree, so it reads as the suburb filter being broken.
  It was not: it was doing exactly what it was told.
- Choosing a district now narrows the suburb list to that district, so the
  contradictory pair cannot be built. Changing the district also clears a suburb
  chosen under the old one, because it is almost never inside the new one.
- Applied on both the all-properties filter bar and the deal-finder bars.

**A day-boundary bug the tests had been hiding**
- The assistant's daily allowance compared an aware New Zealand midnight against
  a timestamp the database writes in UTC. SQLite compares timestamps as text, so
  for the twelve hours where the New Zealand date is ahead of the UTC one, every
  answer read as belonging to yesterday and the allowance never appeared to be
  spent. The comparison is now made in UTC.
- It surfaced because the suite ran at 08:19 NZ instead of the afternoon. Worth
  saying plainly: this was luck, not diligence.

---

## v2.5 — 2026-08-15

**Trace one suburb through the real data, in one click**
- Type a suburb next to the Diagnostics button on the admin dashboard. It prints
  what the filter resolves that name to, how many listings match, how many are
  in the batch at all, and every stored suburb whose name contains it. Whichever
  number is zero is the fault — no more guessing from outside.

---

## v2.4 — 2026-08-15

**Suburb matching no longer depends on the two feeds agreeing**
- The last shape that fits "select a suburb and nothing happens, for EVERY
  suburb, while district is fine": the picker is built from one feed's
  vocabulary and the filter runs against the other's. A sold archive saying
  "Remuera" against listings saying "Remuera, Auckland" is one suburb written
  two ways, and an exact comparison calls them different places — so every
  option matches nothing. District survives because its vocabulary is small and
  shared.
- A name that finds nothing exactly is now retried against the part before the
  first comma, so a region qualifier on one side and not the other stops
  mattering. It is a fallback only: it can never widen a filter that already
  matched, and "Mount Eden" still does not pull in "Mount Albert".

Together with v2.2 (the picker offering only the live listings' own suburbs)
this covers every cause I can construct for that symptom.

---

## v2.3 — 2026-08-15

**Diagnostics reports what the two feeds call their suburbs**
- One explanation for "pick a suburb, nothing happens" cannot be tested from
  outside: if the sold archive and the live listings spell or scope suburbs
  differently, then every name the merged dropdown offers can be a name no live
  listing carries — so nothing matches, for any suburb. District keeps working
  because it has a small shared vocabulary.
- The Diagnostics button now prints both vocabularies with a sample of each and
  how many names appear in both. `in_both: 0` is that fault, visible at a glance.
- v2.2 already makes this impossible on the properties page by building the
  picker from the live listings alone — every option is then a name the page can
  actually return.

---

## v2.2 — 2026-08-15

**Why trends worked and all-properties did not**
- The suburb list merged the SOLD archive with the LIVE listings. The archive
  covers far more suburbs than any single week of listings, so the properties
  page was offering suburbs with nothing live in them. Pick one, get a blank
  screen — indistinguishable from a filter that does nothing.
- Trends worked because it reads sold data: every option it offered had sales
  behind it.
- `/api/properties/suburbs` takes `dataset=for_sale|sold|any`. The properties
  filter asks for `for_sale`, so every option it offers has listings behind it;
  the trends picker keeps the full list, because a suburb with no live listings
  still has years of sales to chart.

---

## v2.1 — 2026-08-15

**One rule for matching a suburb, everywhere**
- Suburb trends worked while the properties filter did not, and that difference
  was the whole bug: trends matched with `ilike` (case-insensitive), the
  properties filter with `==` (not). So the real mismatch in the data is CASE,
  and only the endpoint using the stricter rule broke.
- Every endpoint that takes a caller-supplied suburb or district now resolves it
  the same way — the sold list, the per-suburb sale-method breakdown behind
  "best way to sell here", and the trends panel itself, which was tolerant of
  case but not of stray whitespace.
- The remaining `==` comparisons match a suburb read off the property row
  itself, so they agree by construction and are left alone.

---

## v2.0 — 2026-08-15

**Choosing a suburb did nothing**
- On the all-properties page, picking a district zoomed the map and picking a
  suburb didn't. The suburb dropdown is built from TRIMMED names — it has to be,
  or the same suburb appears three times — but the filter compared the column
  exactly, and the scraped values are not clean. `"Remuera"` never equals
  `"Remuera "`, so it matched nothing. With no points the map has nothing to fit,
  so it stayed put, which looks identical to a control that does nothing. The
  LIST was equally broken; it was just less obvious.
- District only kept working by luck: its options are hard-coded to the raw
  stored strings.
- Suburb and district names now resolve against the spellings actually present
  before filtering, so every option matches the rows it was built from. The
  comparison stays an indexed equality rather than wrapping the column in
  trim()/lower().
- The dropdown groups spellings case-insensitively and shows the one that
  appears on the most listings, with the counts summed across all of them.
- The map states an empty result instead of sitting still. Not moving is how
  this went unnoticed in the first place.

---

## v1.9 — 2026-08-15

**The cause behind three separate "bugs"** — found in the production logs
- The boot log has no trace of `db_bootstrap`, so the start command Railway is
  using is not the Procfile's. It has never run. Every table added after the
  original schema was therefore missing — `assistant_logs`, `app_settings`, the
  geo tables, `bug_reports` — and the geo 500s, the assistant 500s and the empty
  assistant usage table were each diagnosed as their own separate fault.
- The app now creates any missing table itself on startup and logs which ones,
  so the schema depends on the application starting rather than on a start
  command nobody can see.

**Bug log**
- `bug_reports` created by v1.6 lacks the four columns v1.7 added, and
  `create_all` never alters an existing table — so every query failed with
  "no such column: bug_reports.source", making the bug log the one screen that
  could not report its own fault. Missing columns are now added in place, with
  existing rows backfilled and kept.
- A single row with a null timestamp used to fail validation and take the whole
  list down. One odd row now costs that row's timestamp and nothing else.

**Today's brief**
- The top 3 underpriced and top 3 subdividable are admin only, withheld by the
  API rather than merely hidden in the page. They name the specific houses with
  the biggest margins in the batch, and a field the browser is trusted not to
  render is a field anyone can read.

---\n\n## v1.8 — 2026-08-15

**Now it collects the deliberate failures too**
- v1.7's handler only saw CRASHES. Every error this codebase raises on purpose —
  "assistant settings are unavailable: UndefinedTable", "could not delete:
  FOREIGN KEY constraint failed" — is an HTTPException, which FastAPI handles, so
  none of them reached the log. Those are the most useful entries of all:
  someone already worked out what went wrong and wrote it down. 5xx are now
  logged with that message.
- 4xx are deliberately NOT logged. A 401 on an expired token, a 404 on a stale
  link, a 422 on a mistyped form — that is the application working, and filing
  them would bury the real faults.
- The browser reports a fault when the API answers 5xx **or does not answer at
  all**. A server that is down or unreachable is the one failure it can never
  record about itself, and it is exactly the one that looks like "none of it
  works". De-duplicated per session so a retry loop cannot flood.
- Nothing under /api/bugs is ever reported, on either side — a reporter that
  files faults about itself is an unbounded loop with the log as its output.

---

## v1.7 — 2026-08-15

**Bugs file themselves**
- Every unhandled server error is now recorded in the bug log with the endpoint,
  the exception and the traceback. Until now a 500 existed only in a log nobody
  was reading, so a fault was known about exactly as often as someone noticed it
  and said so. The caller still gets a plain 500 and the traceback stays
  server-side.
- Crashes in the page send themselves too — message, stack and page, with the
  build attached. Every round of debugging this app has started with a console
  error pasted into a chat, which only happens when someone has devtools open
  and thinks to copy it.
- Repeats are counted on one entry rather than filed again. One broken endpoint
  clicked ten times is one fault; a log that floods is a log nobody opens.
  Browser crashes fingerprint on the message and page, not the stack, so a
  rebuilt bundle does not re-file every existing crash.
- A fault that recurs after being marked fixed opens a NEW entry rather than
  reviving the closed one, so a regression is visible instead of being folded
  back into something already reviewed.
- Auto-filed rows are badged AUTO in the table, with a repeat count and a
  last-seen time; the CSV carries both.

**Not covered, honestly:** a failed Railway BUILD cannot be captured here — the
app is not running when a build fails. The version panel is what tells you a
deploy did not land: if the API still reports the old number after an upload,
the build failed.

---

## v1.6 — 2026-08-15

**Bug log (Admin → Bug log)**
- File a fault in one line. The form attaches what actually matters and nobody
  would type: the app build, the API's own build (taken from the server
  answering, never from the browser — a mismatch between the two is itself a
  common cause), the page, the browser, and the last ten failed requests with
  the server's own message.
- Status and severity per row, a note for what was found, and **Download CSV**
  with the captured errors flattened into one readable column.
- A build mismatch on a report is flagged in the table: it means the two halves
  were not the same code when the fault happened, which changes what the report
  means.
- Any signed-in user can file one; only an admin can read, edit or export the
  log. The person who hits a fault is rarely the person with the admin password.
- Request bodies are never captured, so a password or API key typed into a form
  cannot end up in a bug report.

---

## v1.5 — 2026-08-15

**Creating users and setting passwords**
- The account lookup used `trim()` inside SQL. `lower()` means the same thing on
  every database; `trim()` does not — the standard spells it `trim(BOTH FROM x)`
  and dialects differ on whether a bare `trim(x)` is a function at all. That put
  sign-in AND every admin user action on a construct that may not exist on the
  database actually running. Now `lower()` only, with a small in-Python fallback
  for stray whitespace.
- `hash_password` could raise, and creating a user, setting a password and
  signing up all call it — so a bcrypt problem surfaced as 500 on exactly those
  three, and as 401 on every login (verification swallows errors and answers
  "wrong password"). None of those symptoms mention bcrypt. It now raises a
  typed error carrying the library and the message, and those endpoints return
  503 naming it.
- A broken bcrypt also stopped the server STARTING, because the boot-time seed
  admin repair hashes a password and anything it raises aborts the lifespan. A
  crash loop cannot tell anyone why. Boot repairs are now non-fatal.
- `/api/admin/diagnostics` reports the bcrypt and passlib versions and whether
  this server can hash and verify a password, and the admin dashboard has a
  **Diagnostics** button that shows the whole report inline — safe to screenshot.

---

## v1.4 — 2026-08-15

**The reason the last few builds shipped bugs**
- The tests run on SQLite; production runs Postgres. **SQLite ignores every
  foreign key unless explicitly told not to**, and it was not told. So a delete
  that left a row pointing at a vanished user passed every test and failed in
  production with a constraint violation the tests could not have seen. That is
  exactly how `app_settings.updated_by` shipped uncleared and made deleting an
  admin answer 500.
- Enforcement is now on for SQLite, so the test database refuses what the real
  one refuses. Turning it on immediately failed three test fixtures that had been
  leaving orphaned rows behind — the same fault, in the tests themselves.

---

## v1.3 — 2026-08-15

**The admin panel 500s**
- `/api/admin/assistant/key`, `/usage` and `/api/admin/users/{id}` answered 500.
  A 500 in a browser console carries nothing and the person reading it cannot see
  the server log, so every round cost a deploy cycle to guess at. Those endpoints
  now either recover or say what is actually wrong.
- `app_settings` is created on demand if it is missing. `db_bootstrap` runs
  `create_all` on every boot, but that call is wrapped in a catch-all — when it
  fails, the first symptom is every assistant endpoint 500ing and the cause is
  only in a boot log nobody is reading by then.
- A failed statement leaves a Postgres transaction unusable, so one missing table
  made every later query in the same request fail with a misleading error. Every
  swallowed exception now rolls back.
- Deleting a user cleans up each dependent table in its own savepoint, so a table
  that does not exist on an older database no longer takes the delete with it.
  `app_settings.updated_by` was a foreign key to users that the delete did not
  clear — an admin who had saved an API key could not be deleted.
- New `GET /api/admin/diagnostics` (admin only): the build, the database engine,
  which tables the models expect that are missing, and the real error per admin
  feature. Table names and row counts only — no row contents, no credentials, and
  never the database URL.

---

## v1.2 — 2026-08-15

**Validation**
- `max_addl_lots` meant two different things depending on which pro-forma ran.
  The THAB terrace path returned the TOTAL terrace count where every other path
  returns `sections - 1`, so each THAB row was over by exactly one — a 100%
  overstatement on a two-lot site. This is the shape of the **+52.57% bias** the
  report has shown on that output every single run.
- The validation report now segments the subdivision outputs by which pro-forma
  produced each row, and prints the exact integer difference distribution for
  lot counts. "+207% on net gain" is a number, not a diagnosis; a blended figure
  across two completely different pro-formas cannot say which one is wrong.

---

## v1.1 — 2026-08-15

**Sign-in**
- Accounts whose stored email had capitals or a stray space could never sign in.
  The lookup lowercased the input and compared it to the column as written, so
  no input could match; the account answered 401 with the correct password.
  Lookups are now case- and space-insensitive, and a boot repair normalises
  existing rows (the boot log reports how many were unreachable).
- Sign-up and admin-create now detect an existing address case-insensitively,
  so the same person cannot end up with two accounts.
- A refused sign-in now logs **why** — no such account, wrong password, or a
  stored value that is not a hash at all. The response is still a bare 401, so
  the reason is not exposed to the browser.
- Account creation is logged, so "I signed up and cannot log in" splits into
  "the account was never created" and "it exists but the password fails".

**Admin**
- Users can be edited (email, name, company, phone, role), have their password
  set, and be deleted. Guards: you cannot delete the account you are signed in
  as, and you cannot delete, demote or deactivate the last active admin.
- Ask Ollie now runs on one account-wide API key set by an admin, capped at 20
  answers per user per day (configurable; 0 switches it off without deleting the
  key). A user with their own key uses that and is not capped. Usage per user is
  visible in the admin panel.
- Build versions panel on the dashboard.

**Numbers we were getting wrong**
- "What moves value here" reported **+$1.04M for a bedroom** in Remuera against a
  $1.70M median, and a bathroom worth more than a bedroom. The estimator compared
  two three-sale medians and never controlled for land, so the bedroom was
  standing in for a few hundred square metres of section. Replaced with a
  regression across every sale in the suburb, holding floor area and land area
  constant, published with a 95% interval and withheld when the sales cannot
  separate the room from the house.
- Listings advertised by negotiation or auction carried a hidden search price
  that we were publishing as an asking price, a valuation and a margin. Those
  listings keep their valuation and lose the invented price.
- `_median` returned the upper of the two middle values on an even count,
  biasing every even-count median in the suburb panel upward.
- Subdividable sites were ranked by lot count, putting a four-lot site in a cheap
  suburb above a one-lot site worth six times as much. Now ranked by net gain.

**Screens**
- Suburb pickers are dropdowns everywhere, built from the batch with sold and
  live counts — a free-text box could not tell a typo from a suburb that is
  genuinely not in the data.
- The dashboard shows the top 3 underpriced (by dollar gap) and top 3
  subdividable (by net gain), not just totals and a link.
- The monthly suburb series can be split by bedroom count.
- The assistant is called **Ask Ollie**.
- Geo endpoints degrade instead of 500ing when their tables are missing.
