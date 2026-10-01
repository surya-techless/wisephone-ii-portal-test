# Subscription Flow: Where Things Could Break

**Purpose:** a plain-language walkthrough of the subscription check-in/check-out flow (portal + phone), organized by the kind of person hitting it, so the team can spot gaps before customers do. Not a code doc — written for review, not for engineers only.

## The flow, in one paragraph

When someone pays (through Stripe or through our carrier partner Gigs), that payment is supposed to be tied to one specific phone (by its IMEI, the phone's serial number). The portal checks "is this phone's payment currently active?" and tells the phone what it found. The phone shows either just a Setup screen, or the full app, based on that answer. That answer can arrive two ways: the phone asks the portal directly, or the portal pushes the answer to the phone the moment something changes (a payment, a cancellation). Both paths are supposed to agree.

---

## New user (setting up a phone for the first time)

**What's supposed to happen:** phone shows Setup only. User goes to the portal, and either they've already paid (Setup finishes automatically) or they haven't (they pay first, then Setup finishes).

**Where this can break:**
- **Payment happens, but never gets linked to the phone.** If the checkout doesn't correctly stamp the phone's IMEI onto the payment record, the portal has no way to know this payment belongs to this phone. The customer paid, but the phone never unlocks. This has historically been a real gap (see "Known gap" below) and is the single most likely way a paying new customer gets stuck.
- **The phone gets Setup-completed before the payment is confirmed.** If a "finish setup" action fires without actually re-checking payment status at that moment, the phone could show as unlocked even though nothing was paid.
- **Two phones sharing one payment.** If one person has a subscription and separately registers a second phone, today's system may currently treat *both* phones as paid, because in some paths it checks "does this person have any active payment somewhere" rather than "does *this* phone have its own paid subscription." Whether that's intentional (family plan) or a bug depends on a business decision the team hasn't finalized yet (see "Open questions").

## Existing user (already set up, already using the phone)

**What's supposed to happen:** nothing changes day to day. The phone occasionally re-checks in the background, but a subscribed user should never notice.

**Where this can break:**
- **A background check briefly disagrees with reality.** There's always a small window (a few minutes at most) between "something changed" and "the phone found out." Normally invisible, but worth knowing it exists rather than assuming everything is instant.
- **The phone goes offline for a long time.** If a phone can't reach the internet at all for an extended stretch, it keeps running on the last answer it got. If that last answer was "subscribed," the phone stays unlocked the whole time it's offline — it doesn't proactively lock itself just because it's been a while. It only re-checks (and could then lock) once it's back online.
- **An old phone that was set up before some of these checks existed.** A subscription that predates the current "tie payment to phone" system might not have that link recorded. A one-time cleanup pass is meant to backfill these, but anything it couldn't figure out on its own needs a person to fix it manually — until then, that phone could look unpaid even if the customer is legitimately paying.

## Subscribed (currently paying)

**What's supposed to happen:** full app access, continuously, for as long as the payment stays active.

**Where this can break:**
- **A renewal or plan change gets misread as a cancellation**, or vice versa — the system has to correctly interpret different payment-provider event types (renewed, updated, past-due, etc.), and a misread event could lock out someone who's actually still paying, or leave a canceled account unlocked.
- **A manual "always treat as subscribed" override on a phone** (used for support cases, demos, etc.) is left in place after it's no longer needed — the phone shows as permanently subscribed even after the real payment lapses, and nobody notices until a customer or teammate flags it.

## Unsubscribed (payment lapsed, canceled, or failed)

**What's supposed to happen:** phone drops back to Setup-only, promptly, without the customer needing to do anything on their end.

**Where this can break:**
- **The "lock the phone" step and the "notify the phone" step are two separate actions, not one.** Today, when a cancellation comes in, the system does two different things: pushes a message to the phone telling it to lock, *and* separately moves the phone into a restricted group in our device-management system. If one of those two succeeds and the other fails silently, the phone and the device-management system can disagree about whether it's actually locked.
- **The phone never gets the message.** If the phone is offline at the exact moment of cancellation, it won't hear about it until it reconnects and does its own background re-check — a delay window rather than an instant lock, same as the "offline for a long time" point above.
- **Whoever pays doesn't realize a lapse also affects a device they've forgotten about** — same underlying multi-device ambiguity noted under "New user."

## Unsubscribed, with a portal account

*(A phone we know about — it's registered in our system — but with no currently-active payment.)*

**What's supposed to happen:** Setup-only, same as any unsubscribed phone. This is the most common and most tested version of "unsubscribed."

**Where this can break:**
- Everything listed under "Unsubscribed" above applies directly.
- **A manual override (bypass) is still on file for a phone that shouldn't have one anymore.** These overrides exist for legitimate support reasons, but they don't expire automatically — if support forgets to remove one, that phone stays unlocked indefinitely regardless of real payment status.

## Unsubscribed, without a portal account

*(A phone we have no record of at all — never officially set up, or its record is missing/broken.)*

**What's supposed to happen:** treated as unsubscribed by default — no record means no proof of payment, so the safe assumption is "not paid" rather than "assume it's fine." The phone should show Setup-only until it goes through proper setup.

### Why this genuinely cannot work without a portal account — not just "an edge case"

This isn't a soft gap that happens to affect some people — it's a hard requirement the whole flow is built on. A few concrete reasons why, in plain terms:

- **The phone's own check-in comes back completely empty, not just "not subscribed."** When the phone asks "am I paid up?", the very first thing looked up is "do we have a record of this phone at all?" If not, the answer stops right there with a flat "no such phone" — the phone never even gets to a real yes/no about payment. There's nothing for the phone to act on except falling back to "assume not paid."
- **A payment can't be tied to a phone unless it started through our own checkout.** The link between "this payment" and "this specific phone" gets created at the moment someone pays, through our portal — that's the only place the phone's serial number gets attached to the payment. If a payment happens any other way (outside our checkout entirely), there's no mechanism to ever connect it to a phone afterward. It isn't that the connection is hard to find — it was never created.
- **Finishing Setup *is* how the portal record gets created.** "No portal account" and "phone stuck on Setup forever" aren't two separate problems — they're the same thing described from two ends. There's no alternate route to a working phone that skips having a portal record; Setup is that record being created.
- **The manual override support uses for special cases doesn't fix this either, at least not automatically.** That override lives independently of whether a phone has a portal record, so a person *can* apply it directly and unlock a phone by hand — but it only works if someone actively does that. The phone's own normal check-in still depends on a portal record existing, and won't find the override on its own if it can't even complete the first lookup.
- **Actions on the device-management side may also come up empty.** Locking or restricting a phone through our device-management system depends on that phone being registered there in the first place. A phone with no portal account may also have no device-management registration — in which case an action meant to restrict it has nothing to actually act on.

**Bottom line:** a portal account isn't one input among several — it's the foundation the rest of the check depends on. Anything downstream of "does this phone have an account" (payment matching, real-time updates, manual overrides via the phone's own check-in, locking) inherits that same hard dependency.

**Where this can break in practice:**
- **A real, paying customer's phone somehow isn't linked to a portal account** — e.g., account creation failed partway through, or a phone was replaced/re-flashed and lost its registration. From the system's point of view this looks identical to someone who never paid at all, and the customer gets treated the same way — locked out — even though they're a legitimate paying customer. This is a support/edge-case scenario, not a bug exactly, but worth the team knowing it's indistinguishable from "no payment" without a person looking into it.
- **Retail/inventory phones** (in a store, not yet sold) fall into this same bucket by design — worth confirming with the team that this is intentional and that store staff know why a not-yet-sold phone only shows Setup.

---

## Cross-cutting risks (apply to more than one scenario above)

- **The stricter, correct "one payment tied to exactly one phone" logic exists in the system today, but isn't actually turned on yet.** It runs quietly in the background comparing its answer to the older logic, but the *older* (looser) logic is still what customers actually experience. Turning on the stricter version is pending a business decision: is "one payment = one phone" actually the rule we want everywhere, or do some legitimate cases (family plans, etc.) need to share one payment across multiple phones? Until that's decided, some of the gaps above (like the "two phones, one payment" leak) are still live in production.
- **Test-only restrictions.** While this system was being built and verified, some of the new logic was deliberately limited to run only against one or two test phones, so a mistake wouldn't affect real customers while it was still being proven out. Those restrictions need to be deliberately removed once everyone is confident it works — if they're forgotten, real customers just keep experiencing the old behavior indefinitely, with no error or warning that anything is "off."

## Open questions for the team

1. Is "one payment unlocks exactly one phone" the rule we want to enforce everywhere, or do family/multi-device plans need to be supported as a real, deliberate exception?
2. Who owns reviewing the phones that a one-time data cleanup couldn't automatically match to a payment, before we turn on stricter enforcement?
3. How long should a phone be allowed to stay unlocked while genuinely unable to reach the internet, before we're comfortable with that being the accepted behavior rather than a gap to close?
4. Who's responsible for periodically checking that manual "always subscribed" overrides are still valid, so they don't quietly become permanent?
