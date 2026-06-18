import { type SQL } from "db/MySQLDb";


export default class WiseOSLogEvent {
    static name: string = "WiseOSLogEvent";

    static migrationStatements: SQL[] = [
        {
            statement: "DROP TABLE IF EXISTS WiseOSLogEvent;",
            values: []
        },
        {
            statement: `CREATE TABLE WiseOSLogEvent (
            id BIGINT NOT NULL AUTO_INCREMENT,

            -- Primary key
            PRIMARY KEY (id),

            -- Correlation + schema
            event_id VARCHAR(255) NOT NULL,
            schema_version INT NOT NULL,

            -- Timing
            event_timestamp TIMESTAMP NOT NULL NOT NULL,
            ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

            -- Device identity
            imei VARCHAR(32) NOT NULL,
            ip_address VARCHAR(45) NOT NULL,

            -- Device context
            app_version VARCHAR(50) NOT NULL,
            os_version VARCHAR(50) NOT NULL,
            boot_id VARCHAR(128) NOT NULL,
            device_name VARCHAR(255) NOT NULL,

            -- Event classification
            domain VARCHAR(100) NOT NULL,
            event_code VARCHAR(100) NOT NULL,
            severity ENUM('DEBUG','INFO','WARN','ERROR','CRITICAL','FATAL') NOT NULL,
            status ENUM('SUCCESS','FAILED') NOT NULL,

            -- Buffer context
            submission_id VARCHAR(128) NOT NULL,
            batch_id VARCHAR(128) NOT NULL,
            buffer_id VARCHAR(128) NOT NULL,

            -- Human-readable context
            message TEXT NULL,

            -- Flexible event enrichment
            metadata JSON NOT NULL,

            -- Unique constraint per device
            UNIQUE KEY uq_wiseos_log_event_imei_event (imei, event_id)
        );`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_timestamp ON WiseOSLogEvent (event_timestamp);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_event_id ON WiseOSLogEvent (event_id);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_imei ON WiseOSLogEvent (imei);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_boot_id ON WiseOSLogEvent (boot_id);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_domain ON WiseOSLogEvent (domain);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_event_code ON WiseOSLogEvent (event_code);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_severity ON WiseOSLogEvent (severity);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_status ON WiseOSLogEvent (status);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_domain_code ON WiseOSLogEvent (domain, event_code);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_imei_timestamp ON WiseOSLogEvent (imei, event_timestamp);`,
            values: []
        },
        {
            statement: `CREATE INDEX idx_wiseos_log_event_submission_id ON WiseOSLogEvent (submission_id);`,
            values: []
        }
    ];
};
