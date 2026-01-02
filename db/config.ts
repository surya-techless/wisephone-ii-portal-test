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

// Screen time snapshot per device per week (synced from WiseOS)
const DeviceScreenTime = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),
    imei: column.text(),                                    // Device IMEI
    weekStartDate: column.date(),                           // Start of the week
    weekEndDate: column.date(),                             // End of the week
    totalScreenTimeMs: column.number(),                     // Total screen time in milliseconds
    dailyAverageMs: column.number(),                        // Daily average in ms
    syncedAt: column.date({ default: new Date() }),         // When this data was synced
    deviceName: column.text({ optional: true }),
    deviceManufacturer: column.text({ optional: true })
  },
  indexes: [
    // Temporarily disabled to allow cleanup of duplicates
    // { on: ["imei", "weekStartDate"], unique: true }         // One record per device per week
  ]
});

// Per-app usage within a week (child of DeviceScreenTime)
const DeviceAppUsage = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),
    screenTimeId: column.number(),                          // References DeviceScreenTime.id
    imei: column.text(),                                    // For easier querying
    packageName: column.text(),
    appName: column.text(),
    totalTimeMs: column.number(),                           // Total usage in ms
    dailyAverageMs: column.number(),
    weekStartDate: column.date()                            // For easier querying
  },
  indexes: [
    { on: ["screenTimeId"] },
    { on: ["imei", "weekStartDate"] }
  ]
});

export default defineDb({
  tables: {
    App,
    BypassTechlessSubscription,
    Wisephone,
    UserPermission,
    OttogridCache,
    DeviceScreenTime,
    DeviceAppUsage
  }
});
