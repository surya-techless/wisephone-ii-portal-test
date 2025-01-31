import { defineDb, defineTable, column } from "astro:db";

const WisephoneFeatures = defineTable({
  columns: {
    wisephoneImei: column.number({ references: () => Wisephone.columns.imei, primaryKey: true }),
    featureId: column.text({ references: () => Features.columns.knoxManageId }),
    isEnabled: column.boolean({ default: true }),
    updatedAt: column.date({ default: new Date() })
  },
  indexes: {
    // Composite primary key
    wisephoneFeatures_pk: {
      on: ["wisephoneImei", "featureId"]
    }
  }
});

const Wisephone = defineTable({
  columns: {
    imei: column.number({ primaryKey: true }),
    nickname: column.text({ optional: true }),
    phoneNumber: column.text(),
    userId: column.text() // Clerk ID
  }
});

const Features = defineTable({
  columns: {
    knoxManageId: column.text({ primaryKey: true }),
    lucideIcon: column.text(),
    name: column.text(),
    description: column.text(),
    isEnabled: column.boolean({ default: true })
  }
});

export default defineDb({
  tables: {
    Features,
    Wisephone,
    WisephoneFeatures
  }
});
