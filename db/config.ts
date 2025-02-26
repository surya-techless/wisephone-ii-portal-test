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

export default defineDb({
  tables: {
    App,
    BypassTechlessSubscription,
    Wisephone,
    UserPermission,
    OttogridCache
  }
});
