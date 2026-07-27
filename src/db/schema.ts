import { mysqlTable, bigint, varchar, int, timestamp, text, json, mysqlEnum, unique, index } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';


export const severityEnum = mysqlEnum('severity', [
  'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'FATAL'
]);

export const statusEnum = mysqlEnum('status', [
  'SUCCESS', 'FAILED'
]);

export const wiseOSLogEvent = mysqlTable('WiseOSLogEvent', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().autoincrement(),
  eventId: varchar('event_id', { length: 255 }).notNull(),
  schemaVersion: int('schema_version').notNull(),
  eventTimestamp: timestamp('event_timestamp').notNull(),
  ingestedAt: timestamp('ingested_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  imei: varchar('imei', { length: 32 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  appVersion: varchar('app_version', { length: 50 }).notNull(),
  osVersion: varchar('os_version', { length: 50 }).notNull(),
  bootId: varchar('boot_id', { length: 128 }).notNull(),
  deviceName: varchar('device_name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 100 }).notNull(),
  eventCode: varchar('event_code', { length: 100 }).notNull(),
  severity: severityEnum.notNull(),
  status: statusEnum.notNull(),
  submissionId: varchar('submission_id', { length: 128 }).notNull(),
  batchId: varchar('batch_id', { length: 128 }).notNull(),
  bufferId: varchar('buffer_id', { length: 128 }).notNull(),
  message: text('message'),
  metadata: json('metadata').notNull(),
}, (table) => {
  return [
    unique('uq_wiseos_log_event_imei_event').on(table.imei, table.eventId),
    index('idx_wiseos_log_event_timestamp').on(table.eventTimestamp),
    index('idx_wiseos_log_event_event_id').on(table.eventId),
    index('idx_wiseos_log_event_imei').on(table.imei),
    index('idx_wiseos_log_event_boot_id').on(table.bootId),
    index('idx_wiseos_log_event_domain').on(table.domain),
    index('idx_wiseos_log_event_event_code').on(table.eventCode),
    index('idx_wiseos_log_event_severity').on(table.severity),
    index('idx_wiseos_log_event_status').on(table.status),
    index('idx_wiseos_log_event_submission_id').on(table.submissionId),
    index('idx_wiseos_log_event_domain_code').on(table.domain, table.eventCode),
    index('idx_wiseos_log_event_imei_timestamp').on(table.imei, table.eventTimestamp),
  ];
});
