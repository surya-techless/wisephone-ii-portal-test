import { defineDb, defineTable, column } from "astro:db";

const Wisephone = defineTable({
  columns: {
    imei: column.number({ primaryKey: true }),
    nickname: column.text({ optional: true }),
    phoneNumber: column.text(),
    userId: column.text() // Clerk ID
  }
});

const BypassTechlessSubscription = defineTable({
  columns: {
    imei: column.number({ primaryKey: true }),
    reason: column.text()
  }
});

const App = defineTable({
  columns: {
    packageName: column.text({ primaryKey: true }),
    name: column.text(),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ optional: true }),
    type: column.text()
  }
});

const UserPermission = defineTable({
  columns: {
    userId: column.text({ primaryKey: true }), // Clerk user ID
    role: column.text({ default: "member" }), // 'member' or 'admin'
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ optional: true })
  }
});

const OttogridCache = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),
    data: column.json(), // Stores the entire response data
    createdAt: column.date({ default: new Date() }),
    expiresAt: column.date()
  }
});

// One row per IMEI: screen time metrics (synced from WiseOS).
const DeviceScreenTimeMetrics = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    syncedAt: column.date({ default: new Date() }),
    deviceName: column.text({ optional: true }),
    deviceManufacturer: column.text({ optional: true }),
    screenTimeDetail: column.json()
  }
});

// One row per IMEI: feature flag state synced from Knox on manage page load.
// Defaults reflect the untouched-subscribed state (what a brand new device would have).
const DeviceFeatureFlags = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    TOOL_DRAWER: column.number({ default: 0 }),
    TOOL_DRAWER_IN_PHONE: column.number({ default: 0 }),
    GOOGLE_APPS: column.number({ default: 0 }),
    NO_HOTSPOT: column.number({ default: 1 }),
    ALLOW_FACTORY_RESET: column.number({ default: 1 }),
    WISEOS_PROTECT: column.number({ default: 0 }),
    SHOW_SCREEN_TIME: column.number({ default: 0 }),
    phoneType: column.text({ default: "WPII" }),
    updatedAt: column.date({ default: new Date() })
  }
});

// One row per IMEI: data usage (future use).
const DeviceDataUsage = defineTable({
  columns: {
    imei: column.text({ primaryKey: true }),
    cycleStartDate: column.date({ optional: true }),
    usageDetail: column.json({ optional: true }),
    lastSyncedAt: column.date({ default: new Date() })
  }
});

export default defineDb({
  tables: {
    App,
    BypassTechlessSubscription,
    Wisephone,
    UserPermission,
    OttogridCache,
    DeviceScreenTimeMetrics,
    DeviceDataUsage,
    DeviceFeatureFlags
  }
});
