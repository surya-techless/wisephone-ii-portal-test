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

export default defineDb({
  tables: {
    Wisephone,
    BypassTechlessSubscription
  }
});
