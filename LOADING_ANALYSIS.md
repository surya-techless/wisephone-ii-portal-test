# Loading Analysis: Manage Device Flow

## Overview

When a user clicks "Manage Device" in `dashboard/index.astro`, it's a simple anchor tag navigation to `/manage/[imei]`. All loading happens **synchronously** on the server-side before the page renders.

## Server-Side Operations (Synchronous - Blocks Page Render)

All operations below happen **sequentially** in the Astro server-side code before the HTML is sent to the browser:

### 1. Authentication & Authorization

- **Operation**: `Astro.locals.auth().userId` - Check if user is authenticated
- **Type**: Local (no network)
- **Sync**: ✅ Synchronous

### 2. User Data Fetching

- **Operation**: `Astro.locals.currentUser()` - Get current user from Clerk
- **Type**: Network request to Clerk API
- **Sync**: ✅ Synchronous (awaited)
- **Network**: External API call to Clerk

### 3. Admin Check

- **Operation**: `isAdmin(user.id)` - Check if user is admin
- **Type**: Database query
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Database query (local or remote Turso)

### 4. Device Lookup (Database)

- **Operation**: Query `Wisephone` table by IMEI
- **Type**: Database query
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Database query (local or remote Turso)
- **Query**:
  ```sql
  SELECT * FROM Wisephone WHERE imei = ? AND userId = ? LIMIT 1
  ```
  (or without userId filter if admin)

### 5. Subscription Status Check

- **Operation**: Check `BypassTechlessSubscription` table
- **Type**: Database query
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Database query
- **Query**:
  ```sql
  SELECT * FROM BypassTechlessSubscription WHERE imei = ? LIMIT 1
  ```

### 6. Stripe/Gigs Subscription Validation (Conditional)

- **Operation**: `validateIsSubscribed()` - Only if not found in bypass table
- **Type**: Network requests
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Multiple external API calls
  - **Stripe API**:
    - `stripe.customers.search()` - Search customers by IMEI metadata
    - `stripe.subscriptions.list()` - Check for active subscriptions
  - **Gigs API** (if Stripe fails):
    - `POST /devices/search` - Search device by IMEI
    - `GET /subscriptions?user={userId}` - Get user subscriptions

### 7. Screen Time Data Fetching

- **Operation**: Query `DeviceScreenTime` table
- **Type**: Database query
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Database query
- **Query**:
  ```sql
  SELECT * FROM DeviceScreenTime WHERE imei = ? ORDER BY weekStartDate DESC LIMIT 4
  ```

### 8. App Usage Data Fetching (If screen time records exist)

- **Operation**: For each week record, fetch:
  - `DeviceAppUsage` records
  - `DeviceDailyScreenTime` records
  - `DeviceDailyAppUsage` records
- **Type**: Multiple database queries (parallelized with `Promise.all`)
- **Sync**: ✅ Synchronous (awaited, but parallelized)
- **Network**: Multiple database queries
- **Queries** (per week):
  ```sql
  SELECT * FROM DeviceAppUsage WHERE screenTimeId = ? ORDER BY totalTimeMs DESC
  SELECT * FROM DeviceDailyScreenTime WHERE screenTimeId = ? ORDER BY date
  SELECT * FROM DeviceDailyAppUsage WHERE dailyScreenTimeId = ? ORDER BY totalTimeMs DESC
  ```

### 9. Installed Apps Fetching

- **Operation**: `actions.wisephones.getInstalledApps` - Get apps from Samsung Knox
- **Type**: Action call (internal)
- **Sync**: ✅ Synchronous (awaited)
- **Network**: Multiple external API calls
  - **Samsung Knox API**:
    - `getDeviceIdFromImei()` - Get device ID from IMEI
      - Calls: `POST /emm/oapi/device/selectDeviceInfoByImei`
    - `getInstalledApps()` - Get installed apps list
      - Calls: `POST /emm/oapi/device/selectDeviceAppList`
  - **Note**: Each Knox API call requires a valid token (may need to fetch/refresh token)

### 10. Apps List Processing

- **Operation**: Process `FAITH_TOOLS_APPS` and create `appsList` object
- **Type**: Local processing
- **Sync**: ✅ Synchronous
- **Network**: None

## Client-Side Operations (After Page Loads)

These happen **asynchronously** after the page HTML is rendered:

### 1. Features Fetching (Client-Side)

- **Operation**: `getFeatures()` - Fetch device groups/features
- **Type**: Network request
- **Sync**: ❌ Asynchronous (doesn't block page render)
- **Network**:
  - `GET /api/samsung-knox.json?action=get-device-groups&imei={imei}`
  - This internally calls `SamsungKnoxService.getGroupsForDevice()`
    - Which calls: `POST /emm/oapi/device/selectDeviceInfoByImei` to Samsung Knox

### 2. Tool Drawer Loading (Conditional - Only if Tool Drawer feature enabled)

- **Operation**: `loadToolDrawer()` - Load available apps from OttoGrid
- **Type**: Network request
- **Sync**: ❌ Asynchronous (doesn't block page render)
- **Network**:
  - `GET /api/ottogrid.json`
  - This may fetch from cache or make external API call to OttoGrid

## Summary

### Server-Side (Blocking - Must Complete Before Page Renders):

1. ✅ Clerk authentication check
2. ✅ User data fetch (Clerk API)
3. ✅ Admin check (DB)
4. ✅ Device lookup (DB)
5. ✅ Subscription bypass check (DB)
6. ✅ Stripe/Gigs subscription validation (External APIs - **SLOW**)
7. ✅ Screen time data (DB - multiple queries)
8. ✅ App usage data (DB - multiple queries, parallelized)
9. ✅ Installed apps (Samsung Knox API - **SLOW**)
10. ✅ Apps list processing (local)

### Client-Side (Non-Blocking - Happens After Page Loads):

1. ❌ Features/groups fetch (Samsung Knox API)
2. ❌ Tool Drawer apps (OttoGrid API, if enabled)

## Performance Bottlenecks

The main delays are likely from:

1. **Samsung Knox API calls** (getInstalledApps) - External API, may require token refresh
2. **Stripe/Gigs subscription validation** - Multiple external API calls
3. **Database queries** - Especially if using remote Turso database
4. **Screen time data queries** - Multiple sequential/parallel queries

## Recommendations

To improve loading performance:

1. **Cache installed apps** - Don't fetch on every page load
2. **Cache subscription status** - Don't validate on every page load
3. **Parallelize server operations** - Some operations could run in parallel
4. **Lazy load screen time data** - Load after initial page render
5. **Add loading screen** - Show user that page is loading (as requested)
