# Dev Notes

Notes on non-obvious decisions made for specific features. Not a full changelog —
just the "why," for context the code/commit history won't give you.

## Shelf-Stock group removal on subscription

**What it does:** once a device is confirmed subscribed, the portal removes it
from the Samsung Knox Manage "Shelf-Stock" group (`fdc85e95e3574f729be74d9c2bce72b4`)
so it stops being treated as unsold retail inventory.

### Why this exists

wiseOS gates its launcher to setup-only whenever Knox's managed config reports
the device is in the Shelf-Stock group (see the wiseOS repo's `dev-notes.md`
for the on-device half of this feature). wiseOS clears its own *local* gate
the moment on-device setup completes — but that's a device-local override
only; it doesn't touch the device's actual Knox group membership. Without this
change, nothing would ever remove a sold/subscribed device from the real
Shelf-Stock group, so a future factory reset or app reinstall on that device
would re-read the (still-true) Knox managed config and incorrectly re-lock the
launcher into setup-only mode. This closes that gap at the source.

### Why `SHELF_STOCK` isn't in `FEATURES`

`KNOX_USER_GROUPS.SHELF_STOCK` was added as a raw group ID constant only —
deliberately **not** added to the `FEATURES` record in `src/libs/utils.ts`.
`FEATURES` entries automatically render as an interactive toggle row in the
manage-page Features tab (admin add/remove via `FeatureManagementService`).
Shelf-Stock isn't something staff toggle per-device from the portal — it's
pre-existing Knox group membership from retail/bulk provisioning that the
portal only needs to *detect and clear*, never assign. There's currently no
"detect-only, not toggleable" flag on the `Feature` type (`isPortalOnly` means
the opposite — no Knox group at all; `isAdminOnly` still allows toggling) — if
that ever changes, a proper flag might be worth adding, but wasn't needed here
since removal happens through a different code path entirely (below).

### Where the removal is hooked in

`assignSubscriptionGroupByDeviceModel()` (`src/pages/manage/[imei].astro`) is
the single existing function every "device is now subscribed" code path
already funnels through — it's what assigns `SUBSCRIBED`/`A16_SUBSCRIBED`/
`CSPIRE_WPII_Subscribed` by device model. It's called from 10+ places across
the file (checkout return, subscription polling, manage-page load with an
active subscription, etc.). Rather than touching every call site, the
Shelf-Stock removal was added once, at the top of that function:

- Placed **after** the existing `DEV_SKIP_KNOX_SUBSCRIPTION_PUSH` bail-out, so
  local dev testing that intentionally skips real Knox mutations also skips
  this.
- Placed **before** the "subscription group already present" bail-out further
  down, so it still fires on repeat manage-page visits even after the
  device's normal subscription group has already been assigned (self-healing
  if a prior removal attempt failed transiently).
- Guarded by `this.features.includes(KNOX_USER_GROUPS.SHELF_STOCK)`, making it
  a no-op — and idempotent — for the overwhelming majority of devices that
  were never Shelf-Stock inventory.

Reuses `removeFeatureFromDevice()`, the same client-side helper every other
feature-toggle removal already uses (`POST /api/samsung-knox.json?action=remove-feature`
→ `SamsungKnoxService.removeFeature(groupId, imei, applyProfile=true)` →
Knox `deleteGroupUnits`, applied immediately, plus the existing "Syncing
Wisephone II" push notification to the device). No new API route, no new Knox
service method.

### Counterpart change

The wiseOS-side setup-only gating driven by this same Knox group lives in the
wiseOS repo — see its `dev-notes.md`.
