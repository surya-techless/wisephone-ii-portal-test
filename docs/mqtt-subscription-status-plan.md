# Task: Publish subscription status to devices via MQTT on webhook receipt — AND receive it on wiseOS

> **Status: IMPLEMENTED (code), NOT DEPLOYED.** Part A (portal), Part B (wiseOS app), and the
> Lambda authorizer source change (Step B1's code, in both the wiseos repo's canonical file and
> this repo's reference copy) are all written and type-checked clean. Nothing has been deployed —
> the portal change isn't merged/live, the wiseOS app change isn't in a released build, and the
> Lambda authorizer hasn't been pushed to AWS. Part C's rollout order (Lambda → wiseOS app →
> portal publish) and end-to-end test matrix still apply before this is actually live for any
> real device.

This is a two-repo change. Publishing from the portal is useless if nothing on the device side
is listening on the right topic with the right AWS IoT permissions — so this plan now covers
both ends of the wire, end to end, with every silent-failure point called out explicitly.

## Repos

### 1. `wisephone-ii-portal-test` (the publisher)
- Branch `surya/dev`, remote `staging-techless`
  (`https://github.com/surya-techless/wisephone-ii-portal-test.git`).
  This branch is pushed and up to date at commit `2d5cf01` — working tree is clean.
- Stack: Astro (server-rendered), `astro:db` (Turso/libSQL), Clerk auth, deployed on Netlify.
- Do NOT add "Co-Authored-By: Claude" (or similar) trailers to commit messages — user's explicit
  instruction in this project.

### 2. `wiseos` (the subscriber — the on-device app that must receive this)
- Path: `/Users/surya/Work/wiseos`. Remote `origin` →
  `git@github.com:Techless-Wisephone/wiseos.git`. Branch `main`.
- **Repo state warning:** `main` has diverged from `origin/main` (2 commits ahead, 2 behind), and
  the working tree is **dirty** — six files already modified and unstaged
  (`WiseOSAccessibilityService.java`, `accessibility_service_config.xml`, `DevDebugBox.astro`,
  `device-stats-service.ts`, `entrypoint.ts`, `constants.ts`), unrelated to this task. These are
  pre-existing in-progress work, not something to discard. When implementation starts: `git
  status`/`git diff` these files first, do not stash or reset them, and make sure new edits land
  cleanly alongside them (some of the exact files this task needs to touch —
  `device-stats-service.ts`, `entrypoint.ts`, `constants.ts`, `DevDebugBox.astro` — are already
  dirty, so diffs will include pre-existing unrelated changes; keep this task's edits clearly
  separable when reviewing).
- Stack: Astro + AlpineJS (`entrypoint.ts` is one large Alpine store) wrapped in Capacitor,
  compiled to an Android APK (`android/`). Runs `mqtt.js` (`^5.15.1`) client-side over WebSocket.
- Build/verify commands: `npm run build` (`astro check && astro build --remote && cap copy`),
  no separate typecheck script beyond `astro check` inside `build`.
- A prior audit of the existing MQTT wiring (both repos, as of 2026-04-28) is saved at
  `/Users/surya/Work/mqtt-audit.txt` — still accurate for the parts of the system this plan
  doesn't change (connection lifecycle, fallback polling, offline/reconnect behavior for the
  *existing* `feature-flags` topic). Worth a read before implementing.

### 3. AWS (the broker — owned by neither repo's source tree, but gates both)
- `aws/lambda/wiseos-mqtt-authorizer/index.mjs` inside the `wiseos` repo is the **source** for
  the AWS IoT Custom Authorizer Lambda (`wiseos-authorizer`), but there is **no IaC and no
  deploy script** for it anywhere in either repo — it's deployed manually (console paste or
  `aws lambda update-function-code`). Editing this file in the repo does **nothing** to the live
  Lambda until someone manually deploys it. This is the single most likely place for this task
  to silently half-work — flagged repeatedly below.

## Background: what already exists and works

### 1. Two webhook endpoints receive subscription events
- `src/pages/api/webhooks/stripe.ts` — POST endpoint, verifies Stripe's `stripe-signature`
  header via `stripe.webhooks.constructEvent()`. Handles
  `customer.subscription.deleted` / `customer.subscription.updated` (resolves `imei` from
  `subscription.metadata.imei`, falling back to `customer.metadata.imei`) and
  `invoice.payment_failed`. Working, tested, receiving real events.
- `src/pages/api/webhooks/gigs.ts` — POST endpoint, verifies Svix signature (`svix-id`,
  `svix-timestamp`, `svix-signature` headers) against `GIGS_WEBHOOK_SECRET` using the `svix`
  npm package. Resolves `imei` from `subscription.metadata.imei`, falling back to
  `GET https://api.gigs.com/projects/techless/devices?user=<subscription.user.id>&sim=<subscription.sim.id>`
  (Gigs' devices list endpoint — NOT `/devices/search`, which only accepts an `imei` filter and
  can't look up by user). Also working, receiving real events, resolving IMEI via the fallback.

Both handlers compute, per event: `imei` (string, normalized digits-only via
`normalizeImei()` from `src/libs/subscription-matching.ts`) and `isActive` (boolean).
Both currently:
1. `console.log`/`console.error` a summary line server-side.
2. `await db.insert(WebhookEvent).values({ source, type, imei, status, isActive: isActive ? 1 : 0 })`.

### 2. `WebhookEvent` DB table (`db/config.ts`)
```ts
const WebhookEvent = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),
    source: column.text(), // "stripe" | "gigs"
    type: column.text(),
    imei: column.text({ optional: true }),
    status: column.text({ optional: true }),
    isActive: column.number({ optional: true }), // 0/1
    receivedAt: column.date({ default: NOW }) // fixed recently — was new Date() (bugged, stamped schema-push time)
  }
});
```

### 3. Dashboard console surfacing (already built, not part of this task, just context)
- `GET /api/webhooks/recent.json` (admin-only) returns the last 20 `WebhookEvent` rows.
- `src/pages/dashboard/index.astro` polls it every 10s and `console.log`s new rows in the
  browser as `[webhook] <source> | <type> | IMEI: <imei> | status: ... | isActive: ... | receivedAt: ...`.
  This is how the events were verified as actually arriving.

### 4. Existing MQTT publish infra — THE KEY REUSABLE PIECE
`src/libs/mqtt.ts` — AWS IoT Core publish helper, already in production use:
```ts
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";

const region = import.meta.env.WPII_AWS_IOT_REGION;
const endpoint = import.meta.env.WPII_AWS_IOT_ENDPOINT;
const accessKeyId = import.meta.env.WPII_AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.WPII_AWS_SECRET_ACCESS_KEY;

const client =
  endpoint && accessKeyId && secretAccessKey
    ? new IoTDataPlaneClient({
        region,
        endpoint: `https://${endpoint}`,
        credentials: { accessKeyId, secretAccessKey }
      })
    : null;

export async function publishFeatureFlags(imei: string, flags: Record<string, number>): Promise<void> {
  if (!client) { /* devLog.warn and return, no throw */ return; }
  const topic = `devices/${imei}/feature-flags`;
  const payload = JSON.stringify({ ...flags, updatedAt: new Date().toISOString() });
  try {
    await client.send(new PublishCommand({ topic, payload: new TextEncoder().encode(payload), qos: 1 }));
  } catch (err) {
    // non-fatal — device falls back to polling
    devLog.error("[MQTT] ❌ Publish error:", err);
  }
}
```
Called from `src/actions/features.ts` right after a `DeviceFeatureFlags` DB write:
```ts
await db.insert(DeviceFeatureFlags).values(...).onConflictDoUpdate(...);
await publishFeatureFlags(imei, flags);
```
Also used for a `sysprobe` heartbeat topic and log-flush acks in the same file — same client,
different topics, same pattern. No new AWS credentials or IAM setup needed — the existing
`client` (or the existing `sysprobeClient`, a second IoTDataPlaneClient with separate IAM keys
`WPII_SYSPROBE_AWS_ACCESS_KEY_ID`/`WPII_SYSPROBE_AWS_SECRET_ACCESS_KEY`, used only for
`sendSysProbe`) can be reused as-is.

## Background: what already exists on the wiseOS (device) side

### 5. wiseOS's MQTT client is single-topic, hardcoded, and auth-locked at the Lambda
`src/device-stats-service.ts` (`initMqttConnection`, ~line 2480) and `src/entrypoint.ts`
(`_connectMqtt`, ~line 2699) currently do exactly one thing over MQTT: connect once IMEI is
known, subscribe to **`devices/{imei}/feature-flags`** only, and update reactive Alpine state
(`portalFeatureFlags` / `mqttLastFlags`) when a message arrives. Key facts that constrain this
task:

- **The message handler hardcodes the topic string and drops anything else.**
  `device-stats-service.ts:2523-2524`:
  ```ts
  mqttClient.on('message', (receivedTopic, payload) => {
    if (receivedTopic !== topic) return;   // topic = `devices/${imei}/feature-flags`, closed over
  ```
  If a second topic is ever published to the same client without changing this handler, every
  message on that second topic is silently discarded — no log, no error. This must change if a
  new topic is added to the same connection.
- **The connection options:** `clientId: wiseos-{imei}`, `username: "wiseos"` (ignored by the
  authorizer), `password: imei` (this IS what the authorizer checks), `clean: false` (persistent
  session — AWS IoT queues QoS 1 messages published while the device is offline and redelivers
  them on reconnect, *as long as the client reconnects with the same clientId before the session
  expires*), `keepalive: 30s`, `reconnectPeriod: 5s`.
- **Resilience pattern already built for `feature-flags`** (see `/Users/surya/Work/mqtt-audit.txt`
  for the full walkthrough): seed fetch over REST on launch (so state is populated even before
  MQTT connects) → MQTT for real-time pushes while connected → automatic fallback to REST
  polling (every 30s in current test config, meant to be 30min in production per that audit's
  reminder #1) whenever MQTT status is `disconnected`/`error`. **Whatever gets built for
  subscription status should follow this same three-layer pattern** — it already exists for
  exactly this kind of "portal state must reach the device reliably" problem, no need to invent
  a new pattern.
- **There is a second, independent precedent for a dedicated per-purpose MQTT client**:
  `src/services/mqtt/log/log-flush-client.ts` (`getLogFlushMQTTClient`) opens its own connection
  to the same broker for the `log/flush/{imei}/ack` topic, with its own clientId
  (`wiseos-{imei}-logflush-sub{Date.now()}`). **Caution if copying this file as a template:** it
  uses `clean: true` and a timestamp-suffixed clientId — i.e. an *ephemeral* session. That's fine
  for log-flush acks (short-lived, only relevant while the app is in foreground actively
  flushing), but it is the **wrong** template for subscription status if offline queueing matters
  here — an ephemeral session means AWS IoT does **not** queue messages published while this
  client is disconnected, so a subscription change published while the device is powered off
  would be lost entirely rather than delivered on reconnect.

### 6. The AWS IoT Custom Authorizer Lambda allow-lists exactly two topics — this is the sharpest edge in this task
`aws/lambda/wiseos-mqtt-authorizer/index.mjs` returns an IAM policy scoped to the connecting
device's own IMEI. Today `iot:Subscribe` and `iot:Receive` are allowed **only** for:
```
devices/{imei}/feature-flags
log/flush/{imei}/ack
```
**A brand-new topic (e.g. `devices/{imei}/subscription`) is not on this list.** If the portal
starts publishing to a topic the device isn't authorized to subscribe to:
- The portal's `PublishCommand` still succeeds (AWS IoT accepts publishes from the IAM-credentialed
  server side regardless of who's allowed to receive them — this is the exact silent-failure
  mode the portal plan's Step 1 already warned about, but it's worse than "wrong topic name": even
  the *correct* new topic name fails the same way if the Lambda isn't updated).
  - Devices that already hold an unexpired IoT Custom Authorizer token keep running on the *old*
    (stale) policy for up to `refreshAfterInSeconds` (currently 43200s = 12h) after the Lambda is
    updated — they will not pick up the newly-allowed topic until that refresh fires or they
    reconnect (app restart, or the `on('close')`/`on('error')` → reconnect cycle). **Any
    end-to-end test done right after deploying the Lambda change must force a fresh connection**
    (kill and relaunch the app, or call `window.__mqttDisconnect()` from the Chrome remote
    debugger then resume the app) — otherwise a test can fail purely because the device is still
    on the old cached policy, which looks identical to "the code is broken."
- If wiseOS's client code subscribes to a topic the current policy doesn't allow, AWS IoT returns
  a SUBACK failure (mqtt.js surfaces this as an `err` in the `subscribe()` callback — the existing
  code already logs this via `console.error('❌ MQTT subscribe error:', err)` and
  `onStatusChange?.('error')`), but **this only appears in on-device/Netlify-adjacent-nowhere logs
  — nothing about it reaches the portal or any dashboard.** It is very easy to ship this, watch
  the portal side work perfectly (publish succeeds, no error), and have zero devices actually
  receiving anything, discovered only much later.

Net: three strings have to agree exactly, in three different places, or this fails silently —
the topic string in the portal's `publishSubscriptionStatus`, the topic string in wiseOS's
subscribe call, and the topic ARN in the authorizer Lambda's `policyDocuments`. **Fail-proofing
this task mostly means fail-proofing that agreement**, not the application logic on either side
(which is each, individually, a small and low-risk change).

### 7. wiseOS already has a REST-based subscription check — currently debug-only, not wired to MQTT or to any enforcement
`src/device-stats-service.ts:2359` (`fetchPortalSubscriptionStatus`) calls
`GET /api/device-subscription/{imei}.json` on the portal (bypass → Stripe-then-Gigs, same check
`validateIsSubscribed()` does). `entrypoint.ts:2299` (`checkSubscriptionStatus`) wraps it and is
called **exactly once**, at app init, via `restoreInitialState()`'s `Promise.allSettled` — not on
an interval, not re-triggered on resume. Its only consumer today is the DevDebugBox "Subscription"
card (`src/components/DevDebugBox.astro`, ~line 73-102): shows `isSubscribed`/`source`/last-checked
time, with a manual "Refresh" button (`@click="checkSubscriptionStatus()"`). **This is pure
debug/observability today — nothing in wiseOS currently gates behavior on subscription status.**
That mirrors the portal-side comment already in `stripe.ts`/`gigs.ts` ("Deciding what the portal
should more actively do with an ended subscription... is a separate decision, deliberately not
wired up here yet") — so on the wiseOS side too, **this task's scope is "receive and surface the
value reliably," not "enforce it."** There is a separate, unrelated `PAYMENT` feature-flag +
`IS_CSPIRE_BUILD`/`isCspireDevice` gate (`entrypoint.ts:2505-2510`) that controls a subscription
paywall today, driven by the existing `feature-flags` MQTT topic / portal feature-flag toggles —
**do not touch this gate as part of this task**; it's a separate mechanism from the Stripe/Gigs
webhook-driven `hasActiveSubscription` this plan is about, and wiring the two together is exactly
the kind of scope creep both repos' existing comments say to defer.

## Decisions needed before implementation

These are genuine open questions — pick defaults are recommended, but confirm before writing code,
since getting any of these wrong reproduces the "publish succeeds, nothing happens on-device,
zero errors anywhere" failure mode this whole plan exists to avoid.

1. **Topic name.** Recommend: **new dedicated topic `devices/{imei}/subscription`** (not reusing
   `feature-flags`). Reasoning: `hasActiveSubscription` comes from a different data source
   (Stripe/Gigs webhooks → `WebhookEvent` table) than feature flags (`DeviceFeatureFlags` table +
   manual portal toggles) — conflating them into one payload/topic means every feature-flag
   change and every subscription change would need to agree on a combined shape, and a bug in one
   path's publish could clobber fields belonging to the other. The cost of a dedicated topic is
   one Lambda authorizer redeploy (Decision 3) — a fixed one-time cost, not ongoing coupling.
   *Alternative considered and rejected:* piggyback `hasActiveSubscription` onto the existing
   `feature-flags` payload/topic to avoid touching the Lambda at all. This would work with zero
   AWS changes, but permanently couples two independent data models and two independent publish
   call sites (features.ts's flag-toggle handler vs. the two webhook handlers) into one message —
   not recommended.
2. **Payload shape.** Recommend, mirroring the `feature-flags` convention exactly:
   `{ "hasActiveSubscription": true, "updatedAt": "2026-09-21T12:00:00.000Z" }` (boolean, ISO8601
   string, same field-naming style as `publishFeatureFlags`'s `{ ...flags, updatedAt }`).
3. **Single shared MQTT client (add topic to the existing `feature-flags` client) vs. a second
   dedicated client (mirroring `log-flush-client.ts`).** Recommend: **add the new topic to the
   existing client's subscribe list**, not a second connection — one WebSocket connection is
   simpler to reason about for connection-status UI, and the existing client already has the
   right session settings (`clean: false`, stable `clientId`) for offline QoS1 queueing, which the
   `log-flush-client.ts` template does *not* (see point 6 above — do not copy that file's
   `clean:true` + dynamic clientId pattern for this). This requires generalizing
   `initMqttConnection`'s message handler from a single hardcoded topic to a small topic→handler
   map (see Part B below) — a small change, not a rewrite.
4. **Should `invoice.payment_failed` also publish?** Already flagged in the portal-side Step 3
   below — recommend "no, not in this pass," same as the existing plan's default.
5. **AWS Lambda deploy mechanism.** Since there's no IaC in-repo, confirm who has console/CLI
   access to update the `wiseos-authorizer` Lambda in the AWS account, and confirm the exact
   region/account (visible at runtime from `context.invokedFunctionArn` — grab it from a recent
   CloudWatch log line, or from the AWS Console, before writing the new ARNs).

## What the user wants (this task)

When either webhook resolves an IMEI + subscription status, publish an MQTT message to that
device: **key = `hasActiveSubscription`, value = `true`/`false` (boolean, not string)**. wiseOS
(the device-side software) receives this on its MQTT subscription and is expected to act on it.

## Part A — Portal (`wisephone-ii-portal-test`) implementation plan

### Step 1 — Topic name and payload shape: RESOLVED by cross-repo inspection, see "Decisions needed before implementation" above
The wiseOS repo has now been inspected directly (see "Background: what already exists on the
wiseOS side" above) rather than guessed at. Recommended, pending final user sign-off on the
Decisions section above:
- Topic: **`devices/{imei}/subscription`** — a *new* topic, not currently in wiseOS's subscribe
  list or in the AWS IoT Custom Authorizer Lambda's allow-list. This means Step 1 is no longer
  just "confirm a string" — it's "confirm the string, then make sure Part B (wiseOS) and the
  Lambda authorizer update actually ship together with this portal change." Publishing to this
  topic before the Lambda's `policyDocuments` and wiseOS's subscribe list both include it will
  silently do nothing on-device — see "Background" point 6 for the full mechanism (this failure
  mode is real, not hypothetical, and won't produce any error on the portal side).
- Payload: `{ hasActiveSubscription: boolean, updatedAt: "<ISO8601>" }`, mirroring the
  `feature-flags` convention (`{ ...flags, updatedAt }`).

Do not ship Step 2-4 below in production against the real topic until Part B's wiseOS subscribe
code AND the Lambda authorizer update (Part B, Step B3) are both deployed — see Part C's rollout
ordering.

### Step 2 — Add a new publish function to `src/libs/mqtt.ts`
Follow the exact shape of `publishFeatureFlags`:
```ts
export async function publishSubscriptionStatus(imei: string, hasActiveSubscription: boolean): Promise<void> {
  if (!client) {
    devLog.warn("[MQTT] ⚠️  Client not initialized — AWS env vars missing. Skipping publish.");
    return;
  }
  const topic = `devices/${imei}/subscription`; // CONFIRM THIS STRING — see Step 1
  const payload = JSON.stringify({ hasActiveSubscription, updatedAt: new Date().toISOString() });
  devLog.log(`[MQTT] Topic   : ${topic}`);
  devLog.log(`[MQTT] hasActiveSubscription :`, hasActiveSubscription);
  try {
    await client.send(new PublishCommand({ topic, payload: new TextEncoder().encode(payload), qos: 1 }));
    devLog.log(`[MQTT] ✅ Published successfully to ${topic}`);
  } catch (err) {
    devLog.error("[MQTT] ❌ Publish error:", err);
    // non-fatal, matching publishFeatureFlags — do not throw, webhook must still 200 fast
  }
}
```
Do not throw from this function — both webhook handlers must still return 200 quickly
(Stripe retries on non-2xx/timeout; same defensive posture makes sense for Gigs/Svix).

### Step 3 — Call it from `src/pages/api/webhooks/stripe.ts`
Inside the `customer.subscription.deleted` / `customer.subscription.updated` case, right after
the existing `await db.insert(WebhookEvent).values({...})` (around line 101 currently), once
`imei` and `isActive` are known:
```ts
import { publishSubscriptionStatus } from "@/libs/mqtt";
// ...
await publishSubscriptionStatus(imei, isActive);
```
Note: this case already does `break` early (line 88) if `imei` couldn't be resolved, so the
publish call only needs to sit in the branch where `imei` is confirmed non-empty — no extra
guard needed.

Decide (with the user, or default to "no") whether `invoice.payment_failed` (the other case,
line 105-117) should also publish something. That event currently has no `imei` resolved at
all (only `customer`/`subscription` ids are logged) — if you want to notify the device on
payment failure specifically, you'd need to add an IMEI resolution step there too, mirroring
the `customer.subscription.*` case's fallback (retrieve Stripe customer → read
`customer.metadata.imei`). Given the existing code comment ("Deciding what the portal should
more actively do with an ended subscription... is a separate decision, deliberately not wired
up here yet"), the safest default is: only publish from the `customer.subscription.*` case for
now, leave `invoice.payment_failed` untouched, and flag this as a follow-up decision in the PR.

### Step 4 — Call it from `src/pages/api/webhooks/gigs.ts`
Right after the existing `await db.insert(WebhookEvent).values({...})` call (currently ends
around line 153), when `imei` is non-empty:
```ts
import { publishSubscriptionStatus } from "@/libs/mqtt";
// ...
if (imei) {
  await publishSubscriptionStatus(imei, isActive);
}
```
Here `imei` can legitimately be empty (Gigs events are stored even with `imei: undefined`,
unlike Stripe which `break`s early) — so this needs its own explicit guard, unlike the Stripe
call site.

### Step 5 — No new env vars, no new dependencies, no schema changes
All required AWS env vars (`WPII_AWS_IOT_REGION`, `WPII_AWS_IOT_ENDPOINT`,
`WPII_AWS_ACCESS_KEY_ID`, `WPII_AWS_SECRET_ACCESS_KEY`) already exist and are already used by
`publishFeatureFlags`/`sendSysProbe`/`sendLogFlushAcks` in the same file — same IoT Core broker,
same client, just a new topic. No `astro:db` schema change needed. No new npm packages needed.

### Step 6 — Portal-side testing/verification (see Part C below for the full combined end-to-end matrix)
- Type-check: `npx tsc --noEmit -p .`
- Replay a Stripe test event via the Stripe CLI/dashboard, or replay a failed/past Gigs message
  via Svix's "Replay" button (Svix endpoint page → Message Attempts → Replay icon), and confirm
  both: (1) the existing `[webhook] ...` console log still appears in the dashboard, and (2) the
  new MQTT publish log line (`[MQTT] ✅ Published successfully to ...`) appears in server/Netlify
  function logs.
- This step alone only proves the portal *attempted* the publish — it does NOT prove a device
  received it (a successful `PublishCommand` says nothing about subscriber-side authorization).
  Part C, Step C2 below is the actual end-to-end proof and must be run before calling this done.
- `devLog.log`/`devLog.warn`/`devLog.error` (from `src/libs/utils.ts`) are DEV-ONLY — silent in
  production. The existing webhook handlers use plain `console.log`/`console.error` for their
  main summary lines specifically so they show up in production/Netlify function logs. Follow
  that same convention for the new MQTT publish call's success/failure lines if production
  visibility matters here too — consider whether `publishSubscriptionStatus`'s logs should also
  use `console.*` rather than `devLog.*`, to avoid this being invisible in prod like the earlier
  gigs.ts bug was (that bug: `devLog.error` on the IMEI-fallback failure meant a real production
  failure produced zero output anywhere until it was tracked down manually).

## Part B — wiseOS implementation plan

### Step B1 — Update the AWS IoT Custom Authorizer Lambda's IAM policy (do this FIRST, before any device-side code)
File: `aws/lambda/wiseos-mqtt-authorizer/index.mjs` (in the `wiseos` repo — the canonical/live
source). Add the new topic to both the `iot:Subscribe` and `iot:Receive` statements, alongside the
existing `feature-flags` and `log/flush/.../ack` entries:

> A reference copy of the updated code already exists in **this** repo at
> `aws/lambda/wiseos-mqtt-authorizer.mjs`, written as part of this planning pass. It is not
> deployed anywhere — deployment (below) still has to happen manually against the real Lambda.
> Keep it and the wiseos repo's copy in sync if either is edited further before this ships.
```js
Action: ['iot:Subscribe'],
Resource: [
  `arn:aws:iot:${region}:${accountId}:topicfilter/devices/${imei}/feature-flags`,
  `arn:aws:iot:${region}:${accountId}:topicfilter/log/flush/${imei}/ack`,
  `arn:aws:iot:${region}:${accountId}:topicfilter/devices/${imei}/subscription`   // NEW
]
// ...same addition to the iot:Receive statement's Resource array
```
Then:
1. **Actually deploy this** — editing the file in the repo changes nothing live. Deploy via
   `aws lambda update-function-code --function-name wiseos-authorizer --zip-file fileb://...` or
   the AWS Console's inline editor (confirm which the team actually uses — there's no deploy
   script in-repo to follow, this needs a person with AWS access).
2. After deploying, this Lambda governs *new* connections/token refreshes only. Devices with an
   already-issued authorizer token keep the old (narrower) policy until
   `refreshAfterInSeconds` (43200s = 12h) elapses or they reconnect. **For testing, force a
   reconnect** (kill/relaunch the wiseOS app, or `window.__mqttDisconnect()` via remote Chrome
   debugging then resume the app) rather than waiting.
3. Sanity-check via AWS IoT Core's own "MQTT test client" in the Console (see Part C, Step C1)
   *before* touching any wiseOS app code — this isolates "is the Lambda policy correct" from "is
   the app's subscribe code correct," so a failure at either stage points at the right layer
   instead of a vague "nothing arrived."

**Is it safe to deploy this Lambda change before any wiseOS app update ships?** Yes — confirmed
safe, no-op for every device still on the old app build:
- The IAM policy change is purely additive (new `Resource` entries alongside the existing
  `feature-flags`/`log/flush/.../ack` grants) — it does not touch, narrow, or re-issue anything
  about the permissions old devices are already using. Their `feature-flags` subscription and
  message handling is unaffected.
- Old app code has no code path that ever attempts to subscribe to `devices/{imei}/subscription`
  — it hardcodes exactly one `subscribe()` call, for `feature-flags` only. Granting a permission
  nobody asks for does nothing.
- If the portal (Part A) also starts publishing to the new topic before an old device's app is
  updated: AWS IoT only delivers a publish to clients holding an active subscription on that
  topic. A device that never subscribed has no subscription entry, so the message is simply not
  delivered — not queued, not retried, no error, no trace anywhere. It's the same as publishing
  to a topic nobody is listening to, because that is exactly what's happening.
- Net: **Lambda-first is safe to roll out standalone**, well ahead of the app update if useful —
  it only starts to matter once a device is running app code that actually attempts the new
  subscribe call, which is why Part C, Step C3 sequences it before the wiseOS app step anyway.

**Caveat for the reverse ordering (wiseOS app ships before this Lambda change is live/propagated
to a given device):** a multi-topic `subscribe([flagsTopic, subscriptionTopic], ...)` call against
a stale (pre-update) authorizer policy can partially fail at AWS IoT — `feature-flags` granted,
`subscription` denied via a per-topic SUBACK failure code — without mqtt.js necessarily raising
that through the blanket `err` argument the Step B2 sketch checks. Per-topic grant/deny is
reported in the `subscribe()` callback's second argument (the `granted` array), which the current
sketch doesn't inspect. Two implications: (1) this is exactly the scenario the recommended
Lambda-first rollout order avoids, and (2) regardless of rollout order, Step B2's subscribe
callback should check `granted` per-topic and log a distinct warning for a denied topic, rather
than trusting the absence of `err` to mean both subscriptions succeeded — cheap defense-in-depth
against a rollout-order mistake or a future third topic hitting the same gap.

### Step B2 — Generalize the MQTT message handler to route by topic instead of a hardcoded single-topic check
File: `src/device-stats-service.ts`, `initMqttConnection()` (~line 2480). Per Decision 3 above,
add the new topic to the *same* client/connection rather than opening a second one. Today the
handler is:
```ts
const topic = `devices/${imei}/feature-flags`;
// ...
mqttClient.on('message', (receivedTopic, payload) => {
  if (receivedTopic !== topic) return;
  // ... parse as feature flags
});
```
This needs to become topic-aware, e.g.:
```ts
const flagsTopic = `devices/${imei}/feature-flags`;
const subscriptionTopic = `devices/${imei}/subscription`;
// ...
mqttClient.on('connect', () => {
  onStatusChange?.('connected');
  mqttClient!.subscribe([flagsTopic, subscriptionTopic], { qos: 1 }, (err) => { /* ... */ });
});

mqttClient.on('message', (receivedTopic, payload) => {
  const raw = payload.toString();
  try {
    if (receivedTopic === flagsTopic) {
      const flags = JSON.parse(raw) as PortalFeatureFlags;
      onFlags(flags);
    } else if (receivedTopic === subscriptionTopic) {
      const status = JSON.parse(raw) as { hasActiveSubscription: boolean; updatedAt: string };
      onSubscriptionStatus?.(status);
    } else {
      return; // unrecognized topic, ignore
    }
    onLastMessage?.(raw, new Date().toISOString());
  } catch (e) {
    console.error('❌ MQTT message parse error:', e);
  }
});
```
Add a new optional `onSubscriptionStatus` callback to the `MqttCallbacks` interface, matching the
existing `onFlags` pattern. Define the payload type (e.g. `SubscriptionStatusPush`) rather than
inlining it, so the field names (`hasActiveSubscription`, `updatedAt`) are typed and a portal-side
rename gets caught at compile time instead of silently `undefined`-ing at runtime.

### Step B3 — Wire the new callback through `entrypoint.ts` into reactive state
Mirror the existing `mqttLastFlags`/`mqttStatus` fields (~line 285-297) and the
`_connectMqtt` wiring (~line 2699-2731). Add:
```ts
subscriptionStatusFromMqtt: null as { hasActiveSubscription: boolean; updatedAt: string } | null,
```
and in the `initMqttConnection(deviceImei, { ... })` callbacks object, add:
```ts
onSubscriptionStatus: (status) => {
  this.subscriptionStatusFromMqtt = status;
  console.log('[MQTT] Subscription status received:', status);
},
```
Decide (recommend: yes, for parity with `checkSubscriptionStatus()`'s existing shape and to avoid
two divergent "is this device subscribed" fields) whether this should also update
`subscriptionCheckResult`/`subscriptionCheckStatus`/`subscriptionCheckLastCheckedAt` directly (the
same fields the REST-based `checkSubscriptionStatus()` populates), so DevDebugBox's existing
Subscription card shows the MQTT-pushed value without needing a second UI block. If done this way,
be explicit in the DevDebugBox UI (Step B4) about *which* source (`mqtt` vs `rest`) last updated
the value, since they can now disagree (e.g. MQTT push arrived but the device hasn't done a fresh
REST check since).

### Step B4 — Surface it in `DevDebugBox.astro` for manual verification during testing
`src/components/DevDebugBox.astro` (~line 73-102) already has a "Subscription" card wired to
`subscriptionCheckResult`/`subscriptionCheckStatus`. Add a small `x-show`/badge similar to the
existing `mqttStatus` badge at the top of the box (~line 45-46) so a tester can see, without
attaching a debugger, whether the MQTT-pushed value and the REST-checked value currently agree —
this is the fastest way to catch a payload-shape or topic mismatch bug during manual testing
without needing AWS Console access.

### Step B5 — Decide on / implement the offline-reconciliation fallback
Because AWS IoT persistent-session message queueing has real limits (finite retention, and only
guaranteed if the client reconnects with the same `clientId` before the session expires — see
Background point 5), an MQTT push alone is not a fully reliable delivery mechanism for a device
that's been offline for an extended period (powered off, no signal, etc.). Recommend: on app
launch/resume, keep doing one REST `checkSubscriptionStatus()`/`fetchPortalSubscriptionStatus()`
call as today (already exists, already wired into `restoreInitialState()`), so a missed MQTT
message during an extended offline period gets reconciled on next launch rather than leaving the
device on a stale cached value indefinitely. This requires no new code beyond what already exists
— just don't remove or weaken the existing REST check when adding the MQTT path, and confirm this
explicitly as a design decision rather than something that happens to work.

### Step B6 — No new npm dependencies, no new native (Android/Capacitor) permissions
`mqtt` (`^5.15.1`) is already a dependency and already used for the exact same broker/pattern.
This task is JS/TS-layer only (`device-stats-service.ts`, `entrypoint.ts`,
`DevDebugBox.astro`) plus the AWS Lambda (Step B1) — no changes needed under `android/`.

### Step B7 — wiseOS build/verify commands
- `npm run build` (runs `astro check` — this is wiseOS's typecheck-equivalent — then
  `astro build --remote && cap copy`).
- No unit test suite covers this path; `tests/` (Playwright, `test:e2e`/`test:gui`) is UI-flow
  testing and unlikely to be the right tool for verifying an MQTT payload arrived — manual /
  AWS-Console verification (Part C, Step C2) is the realistic verification method here, same as
  the portal side.

## Part C — Cross-cutting fail-proofing: rollout order, and the combined end-to-end test matrix

### Step C1 — Verify the AWS IoT layer in isolation, before either app's code is wired up
Using AWS IoT Core's "MQTT test client" in the AWS Console (two browser tabs, or one tab plus the
CLI):
1. Subscribe to `devices/<test-imei>/subscription` (or a wildcard `devices/+/subscription`) as
   the AWS account itself (Console test client uses your IAM identity, not the device authorizer
   — this only proves the topic namespace is reachable at the account level, it does **not**
   prove a device's Custom Authorizer policy is correct; Step C1b below does).
2. Manually publish a test payload to that topic from the Console and confirm the subscription in
   (1) receives it — proves the topic name is spelled identically wherever it's typed.
3. **Step C1b — the check that actually matters:** using an MQTT client configured exactly like
   wiseOS's (`wss://.../mqtt?x-amz-customauthorizer-name=wiseos-authorizer`, `username: "wiseos"`,
   `password: <a real or test IMEI>`, matching the 15-digit IMEI format the Lambda validates),
   confirm it can **subscribe** to `devices/<that-imei>/subscription` and receive a message
   published there — this is the only test that actually exercises the Custom Authorizer's
   updated policy end-to-end, and must be done *after* Step B1's Lambda deploy and a forced
   reconnect.

### Step C2 — Full end-to-end test, both repos wired up
1. Deploy Part B's Lambda change (Step B1) and confirm via Step C1b.
2. Deploy wiseOS's app-side change (Steps B2-B4) to a real or emulator test device, force a fresh
   MQTT connection (app relaunch), and confirm in on-device console logs (or DevDebugBox, Step B4)
   that it subscribed successfully to the new topic (`✅ MQTT subscribed to: devices/.../subscription`,
   no subscribe error).
3. Deploy the portal's change (Part A, Steps 2-4) to a non-production environment if available,
   or gate behind manual testing on the real endpoint using Stripe CLI/Svix replay as described in
   Step 6.
4. Trigger a real or replayed webhook event for the *same test IMEI* used in Step 2.
5. Confirm, in order: (a) portal logs show `[MQTT] ✅ Published successfully to
   devices/<imei>/subscription`, (b) the on-device app logs/DevDebugBox show a received message
   with the correct `hasActiveSubscription` value within a few seconds, (c) toggling the
   subscription state the other way (e.g. cancel then reactivate) produces a second correctly-updated
   push, not a stuck/stale value.
6. Repeat step 4-5 once with the **device deliberately offline** (airplane mode / MQTT
   force-disconnected via `window.__mqttDisconnect()`) at publish time, then bring it back online,
   to confirm the offline-queueing behavior (Background point 5 / Step B5) actually works as
   expected rather than silently dropping the message — this is the scenario most likely to be
   skipped in testing and most likely to matter in production (a phone that was off overnight).

### Step C3 — Recommended rollout order (to avoid the "publish into a void" failure mode entirely)
1. Part B, Step B1 (Lambda authorizer update) — deploy and verify in isolation (Step C1).
2. Part B, Steps B2-B4 (wiseOS subscribe code) — deploy to at least one real test device, verify
   it subscribes successfully (Step C1b) *before* anything is publishing to the topic yet.
3. Part A, Steps 2-5 (portal publish code) — deploy last, once a device is confirmed listening.
4. Run the full Step C2 end-to-end test before considering this done.

This order means that if something is wrong, the failure happens loudly (a subscribe error in
device logs, or a Lambda deploy that visibly didn't take) rather than the portal quietly
publishing into a topic nothing is authorized to hear for however long it takes someone to notice.

## Known related bugs already fixed on this branch (context, not to redo)
- `db/config.ts`: `WebhookEvent.receivedAt` used `default: new Date()`, which is evaluated once
  at schema-push time, so every row got the same timestamp. Fixed to `default: NOW` (imported
  from `astro:db`). Note: the `createdAt`/`syncedAt`/`updatedAt`/`lastSyncedAt` columns on
  several other tables in the same file (`App`, `UserPermission`, `OttogridCache`,
  `DeviceScreenTimeMetrics`, `DeviceDataUsage`, `DeviceFeatureFlags`) still have this same
  `new Date()` bug and were deliberately left alone as out of scope — flag if touching schema
  again.
- `gigs.ts` originally checked `Authorization: Bearer <shared secret>`, but Gigs delivers via
  Svix (svix-id/svix-timestamp/svix-signature headers, no Authorization header) — fixed to
  verify via the `svix` npm package against `GIGS_WEBHOOK_SECRET` (must be the endpoint's
  `whsec_...` Signing Secret from the Gigs/Svix dashboard, not an arbitrary shared string).
- `gigs.ts`'s IMEI fallback originally called `POST /devices/search` with `{ user: ... }` in the
  body — that endpoint only accepts `imei` as a filter and silently ignored `user`, so the
  fallback never worked. Fixed to `GET /devices?user=<id>&sim=<id>` (Gigs' devices *list*
  endpoint, which does support those query params), then disambiguates multiple results using
  `gigsSubscriptionMatchesDevice()` from `src/libs/subscription-matching.ts` (already existed,
  used elsewhere in `src/libs/stripe.ts` for the same kind of device/subscription matching).

## Relevant existing helper: `src/libs/subscription-matching.ts`
```ts
export function normalizeImei(value: string): string {
  return value.replace(/\D/g, "");
}

export function stripeSubscriptionMatchesImei(
  metadata: Record<string, string> | null | undefined,
  imei: string
): boolean {
  const normalizedMetadata = normalizeImei(metadata?.imei ?? "");
  const normalizedImei = normalizeImei(imei);
  return normalizedMetadata !== "" && normalizedMetadata === normalizedImei;
}

export const GIGS_ACTIVE_STATUSES = ["active", "pending"] as const;

export function gigsSubscriptionMatchesDevice(sub: Subscription, device: Device): boolean {
  return (
    (GIGS_ACTIVE_STATUSES as readonly string[]).includes(sub.status) &&
    Boolean(sub.sim?.id) &&
    Boolean(device.sims?.some((sim) => sim.id === sub.sim?.id))
  );
}
```

## Relevant types (`src/libs/types.ts`)
```ts
export type Subscription = {
  object: "subscription";
  id: string;
  metadata: Record<string, unknown>;
  phoneNumber: string;
  sim: Sim;
  status: "pending" | "active" | "inactive" | "canceled";
  user: User;
  // ...other fields (plan, currentPeriod, etc.) omitted — see full file
};

export type Device = {
  object: "device";
  id: string;
  metadata: Record<string, unknown>;
  imei: string;
  model: DeviceModel;
  name: string;
  sims: Sim[];
  user: User;
  createdAt: string;
};

export type Sim = {
  object: "sim";
  id: string;
  metadata: Record<string, unknown>;
  iccid: string;
  provider: string;
  status: "active" | "inactive";
  type: string;
  createdAt: string;
};

export type User = {
  object: "user";
  id: string;
  metadata: Record<string, unknown>;
  birthday: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  preferredLocale: string;
  // ...
};
```

## Current full contents of both webhook handlers (as of commit `2d5cf01`)

### `src/pages/api/webhooks/gigs.ts`
```ts
import type { APIRoute } from "astro";
import { db, WebhookEvent } from "astro:db";
import { GIGS_API_KEY, GIGS_WEBHOOK_SECRET } from "astro:env/server";
import { Webhook } from "svix";
import { GIGS_ACTIVE_STATUSES, gigsSubscriptionMatchesDevice, normalizeImei } from "@/libs/subscription-matching";
import type { Device, DeviceList, Subscription } from "@/libs/types";
import { devLog } from "@/libs/utils";

const GIGS_BASE_URL = "https://api.gigs.com/projects/techless";

type GigsWebhookPayload = { type?: string; data?: Subscription } | Subscription;

/**
 * POST /api/webhooks/gigs
 *
 * Receives Gigs webhook events so subscription cancellations/status changes
 * reach the portal the moment they happen, instead of waiting for someone to
 * open the dashboard/manage page (today the only thing that calls
 * validateIsSubscribed() — see src/libs/stripe.ts, the "gigs" branch of
 * validateSubscription()).
 *
 * Configure this in Gigs' dashboard/API once confirmed against their actual
 * webhook docs, pointed at this URL, subscribed to subscription status
 * changes (canceled/inactive).
 *
 * Auth: Gigs delivers webhooks through Svix, so requests carry svix-id,
 * svix-timestamp and svix-signature headers (no Authorization header).
 * GIGS_WEBHOOK_SECRET must be the endpoint's Signing Secret (whsec_...) from
 * the Gigs/Svix dashboard.
 *
 * Events are logged (server-side) and recorded in the WebhookEvent table, so
 * the dashboard can poll /api/webhooks/recent.json and show them without
 * tailing server logs. Deciding what the portal should more actively do with
 * an ended subscription is a separate decision, deliberately not wired up
 * here yet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!GIGS_WEBHOOK_SECRET) {
    console.error("[gigs webhook] GIGS_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Signature verification needs the raw, unparsed body — do not JSON-parse first.
  const rawBody = await request.text();

  try {
    new Webhook(GIGS_WEBHOOK_SECRET).verify(rawBody, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? ""
    });
  } catch (err) {
    devLog.error("[gigs webhook] signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let payload: GigsWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    devLog.error("[gigs webhook] failed to parse request body:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Gigs may send the subscription directly, or wrapped in an event envelope
  // (mirroring Stripe's { type, data: { object } } shape) — accept either
  // until Gigs' real webhook payload shape is confirmed.
  const subscription: Subscription | undefined =
    "object" in payload && payload.object === "subscription" ? (payload as Subscription) : (payload as { data?: Subscription }).data;

  if (!subscription) {
    console.error("[gigs webhook] payload did not contain a subscription object, skipping");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const isActive = (GIGS_ACTIVE_STATUSES as readonly string[]).includes(subscription.status);

  // Strict path: IMEI on the subscription's own metadata, if Gigs passes it through.
  let imei = normalizeImei(String(subscription.metadata?.imei ?? ""));

  // Fallback: a Gigs subscription doesn't carry a device/IMEI field directly,
  // so resolve it via GET /devices filtered by the subscription's user (and
  // sim, to narrow it server-side when a user has more than one device).
  // Note: POST /devices/search only accepts an "imei" filter — it can't be
  // used to look a device up by user, which is why this uses the list
  // endpoint instead.
  if (!imei && subscription.user?.id) {
    try {
      const devicesApiUrl = new URL(`${GIGS_BASE_URL}/devices`);
      devicesApiUrl.searchParams.set("user", subscription.user.id);
      if (subscription.sim?.id) {
        devicesApiUrl.searchParams.set("sim", subscription.sim.id);
      }

      const deviceResponse = await fetch(devicesApiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${GIGS_API_KEY}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(15000)
      });

      if (deviceResponse.ok) {
        const devices = (await deviceResponse.json()) as DeviceList;
        // Prefer the device whose SIM matches this subscription, in case the user has more than one.
        const device: Device | undefined =
          devices.items?.find((d) => gigsSubscriptionMatchesDevice(subscription, d)) ?? devices.items?.[0];
        imei = normalizeImei(String(device?.imei ?? ""));
      } else {
        console.error(`[gigs webhook] devices lookup by user failed with status ${deviceResponse.status}`);
      }
    } catch (err) {
      console.error("[gigs webhook] failed to resolve device for IMEI fallback:", err);
    }
  }

  // If Gigs sent an event envelope (e.g. "com.gigs.subscription.canceled"), use its
  // type for the log; otherwise fall back to a label derived from the subscription status.
  const eventType =
    typeof (payload as { type?: string }).type === "string"
      ? (payload as { type: string }).type
      : `subscription.${subscription.status}`;

  if (!imei) {
    console.error(
      `[gigs webhook] ${eventType} — subscription ${subscription.id} (status: ${subscription.status}) — no IMEI resolved, skipping`
    );
  } else {
    console.log(
      `[gigs webhook] ${eventType} | IMEI: ${imei} | subscription: ${subscription.id} | status: ${subscription.status} | isActive: ${isActive}`
    );
  }

  await db.insert(WebhookEvent).values({
    source: "gigs",
    type: eventType,
    imei: imei || undefined,
    status: subscription.status,
    isActive: isActive ? 1 : 0
  });

  // <-- STEP 4 GOES HERE: if (imei) { await publishSubscriptionStatus(imei, isActive); }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
```

### `src/pages/api/webhooks/stripe.ts`
```ts
import type { APIRoute } from "astro";
import Stripe from "stripe";
import { db, WebhookEvent } from "astro:db";
import { STRIPE_WEBHOOK_SECRET } from "astro:env/server";
import { stripe } from "@/libs/stripe";
import { normalizeImei } from "@/libs/subscription-matching";
import { devLog } from "@/libs/utils";

/**
 * POST /api/webhooks/stripe
 *
 * Receives Stripe webhook events so subscription cancellations/status changes
 * reach the portal the moment they happen, instead of waiting for someone to
 * open the dashboard/manage page (today the only thing that calls
 * validateIsSubscribed() — see src/libs/stripe.ts).
 *
 * Configure in the Stripe Dashboard: Developers > Webhooks > Add endpoint,
 * pointed at this URL, subscribed to at least:
 *   - customer.subscription.deleted
 *   - customer.subscription.updated
 *   - invoice.payment_failed (optional, catches a failed renewal early)
 * Put the endpoint's signing secret in STRIPE_WEBHOOK_SECRET.
 *
 * Events are logged (server-side) and recorded in the WebhookEvent table, so
 * the dashboard can poll /api/webhooks/recent.json and show them without
 * tailing server logs. Deciding what the portal should more actively do with
 * an ended subscription — immediately revoke the Knox SUBSCRIBED group the
 * way manage/[imei].astro's syncFeatureFlagsToDb does reactively today — is a
 * separate decision, deliberately not wired up here yet.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Signature verification needs the raw, unparsed body — do not JSON-parse first.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    devLog.error("[stripe webhook] signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  switch (event.type) {
    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Strict path: IMEI stamped directly on the subscription — "source of
      // truth for per-device validation" per src/actions/stripe.ts.
      let imei = normalizeImei(String((subscription.metadata as Record<string, string> | null)?.imei ?? ""));

      // Legacy fallback: older devices only have IMEI on the customer.
      if (!imei && typeof subscription.customer === "string") {
        try {
          const customer = await stripe.customers.retrieve(subscription.customer);
          const isDeleted = "deleted" in customer && customer.deleted;
          if (!isDeleted) {
            imei = normalizeImei(String((customer as Stripe.Customer).metadata?.imei ?? ""));
          }
        } catch (err) {
          devLog.error("[stripe webhook] failed to retrieve customer for IMEI fallback:", err);
        }
      }

      if (!imei) {
        console.error(
          `[stripe webhook] ${event.type} — no IMEI on subscription ${subscription.id} or its customer, skipping`
        );
        break;
      }

      const isActive = subscription.status === "active" || subscription.status === "trialing";
      console.log(
        `[stripe webhook] ${event.type} | IMEI: ${imei} | subscription: ${subscription.id} | status: ${subscription.status} | isActive: ${isActive}`
      );
      await db.insert(WebhookEvent).values({
        source: "stripe",
        type: event.type,
        imei,
        status: subscription.status,
        isActive: isActive ? 1 : 0
      });

      // <-- STEP 3 GOES HERE: await publishSubscriptionStatus(imei, isActive);

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(
        `[stripe webhook] invoice.payment_failed | customer: ${invoice.customer} | subscription: ${invoice.subscription}`
      );
      await db.insert(WebhookEvent).values({
        source: "stripe",
        type: event.type,
        status: "payment_failed",
        isActive: 0
      });
      break;
    }

    default:
      devLog.log(`[stripe webhook] Unhandled event type: ${event.type}`);
  }

  // Stripe requires a fast 2xx response — anything else (or a timeout) triggers retries.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const ALL: APIRoute = ({ request }) => {
  return new Response(JSON.stringify({ error: `Method ${request.method} not allowed` }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};
```

## Env vars already configured (do not need to be added)
Referenced in `astro.config.mjs` / `.env` (values redacted here, already set on Netlify + local `.env`):
- `STRIPE_WEBHOOK_SECRET`
- `GIGS_WEBHOOK_SECRET` (must be Svix's `whsec_...` signing secret, not an arbitrary string)
- `GIGS_API_KEY`
- `WPII_AWS_IOT_REGION`, `WPII_AWS_IOT_ENDPOINT`, `WPII_AWS_ACCESS_KEY_ID`, `WPII_AWS_SECRET_ACCESS_KEY`
- `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN` (Turso, used by `astro db push --remote`)

## Package manager / commands
- `npm` (there's a `package-lock.json`, no other lockfile).
- `npm run db:update` → `astro db push --remote` (pushes `db/config.ts` schema to the remote Turso DB).
- `npx tsc --noEmit -p .` for type-checking.
- `npx astro db verify --remote` to check schema drift; `npx astro db push --remote --dry-run` to preview.
