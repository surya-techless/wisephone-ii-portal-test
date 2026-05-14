import { db,  } from "astro:db";


export default class WiseOSLogEvent {
  static name: string = "WiseOSLogEvent";

  // intended for batch writes within a transaction
  static migrationStatements = [
    `DROP TABLE IF EXISTS WiseOSLogEvent;`,
    `CREATE TABLE WiseOSLogEvent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Correlation + schema
      event_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,

      -- Timing
      event_timestamp TEXT NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      -- Device identity
      imei TEXT NOT NULL,
      ip_address TEXT NOT NULL,

      -- Device context
      app_version TEXT NOT NULL,
      os_version TEXT NOT NULL,
      boot_id TEXT NOT NULL,
      device_name TEXT NOT NULL,

      -- Event classification
      domain TEXT NOT NULL,
      event_code TEXT NOT NULL,
      severity TEXT NOT NULL,

      -- Human-readable context
      message TEXT NULL,

      -- Flexible event enrichment
      metadata TEXT NOT NULL DEFAULT '{}',

      -- Severity validation
      CONSTRAINT chk_wiseos_log_event_severity
          CHECK (
              severity IN (
                  'DEBUG',
                  'INFO',
                  'WARN',
                  'ERROR',
                  'CRITICAL',
                  'FATAL'
              )
          )
    );`,
    `CREATE INDEX idx_wiseos_log_event_timestamp ON WiseOSLogEvent (event_timestamp DESC);`,
    `CREATE INDEX idx_wiseos_log_event_event_id ON WiseOSLogEvent (event_id);`,
    `CREATE INDEX idx_wiseos_log_event_imei ON WiseOSLogEvent (imei);`,
    `CREATE INDEX idx_wiseos_log_event_boot_id ON WiseOSLogEvent (boot_id);`,
    `CREATE INDEX idx_wiseos_log_event_domain ON WiseOSLogEvent (domain);`,
    `CREATE INDEX idx_wiseos_log_event_event_code ON WiseOSLogEvent (event_code);`,
    `CREATE INDEX idx_wiseos_log_event_severity ON WiseOSLogEvent (severity);`,
    `CREATE INDEX idx_wiseos_log_event_domain_code ON WiseOSLogEvent (domain, event_code);`,
    `CREATE INDEX idx_wiseos_log_event_imei_timestamp ON WiseOSLogEvent (imei, event_timestamp DESC);`
  ];
};
