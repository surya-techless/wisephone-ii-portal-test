import { Cache, cache } from "cache/Cache";
import { tursoDb } from "db/TursoDb";

import { sendLogFlushAcks } from "@/libs/mqtt";
import type { LogEvent } from "cache/dto/LogEvent";


export type BatchIdentifier = {
  topic: string,
  batchId: string
}


export class LogBufferService {
  public static async ingest(payload: any): Promise<void> {
    payload = payload.events;
    await cache.push(JSON.stringify(payload));
    const bufferSize = await cache.getBufferSize();

    if (bufferSize >= Cache.bufferSizeNumKeys) {
      console.warn("⚠️ log buffer needs to be flushed");
      await this.flush();
      console.log("✅ log buffer flush success");
    }
  }

  private static async flush(): Promise<void> {
      // NOTE:
      // each log event item in cache will be an array of a file dump of on-device log events
      // also, this will potentially be a HUGE object in memory if `bufferSizeNumKeys` is too high
    const globallyCachedLogs = await cache.getAll();

    if (globallyCachedLogs.length === 0) {
      console.warn("⚠️ log buffer empty");
      return;
    }

    const batches = globallyCachedLogs.map((batch) => JSON.parse(JSON.parse(batch)));
    const sqlStatements: string[] = [];
    const batchIdentifiers: Set<BatchIdentifier> = new Set();  // no dups

    batches.forEach(
      (batch) => {
        batch.forEach(
          (logEvent: LogEvent) => {
            sqlStatements.push(this.buildInsertStatement(logEvent))
            batchIdentifiers.add({
              topic: `log/flush/${logEvent.pii.imei}/ack`,
              batchId: logEvent.batch_id
            });
          });
      });

    try {
      // batch log flush and db commit to keep write amplification to a minimum
      await tursoDb.batch(sqlStatements);
      await cache.flush(globallyCachedLogs.length);

      // this is an async method but let's not block the thread before returning
      // MQTT-based acknowledgements do not have to be sent synchronously
      sendLogFlushAcks(batchIdentifiers);
    } catch (e) {
        console.error("❌ Log buffer flush failure:", e);
        throw e;
    }
  }

  private static buildInsertStatement(log: LogEvent) {
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) {
        return "";
      }

      return String(v).replace(/'/g, "''");
    };

    return `
      INSERT INTO WiseOSLogEvent (
        event_id, schema_version, event_timestamp, imei, ip_address, app_version, os_version, boot_id, device_name, domain, event_code, severity, message, metadata
      ) VALUES (
          '${escape(log.event_id)}',
          ${log.schema_version},
          '${escape(log.timestamp)}',
          '${escape(log.pii.imei)}',
          '${escape(log.pii.ip_address)}',
          '${escape(log.device_context.app_version)}',
          '${escape(log.device_context.os_version)}',
          '${escape(log.device_context.boot_id)}',
          '${escape(log.knox_context.device_name)}',
          '${escape(log.domain)}',
          '${escape(log.event_code)}',
          '${escape(log.severity)}',
          '${escape(log.message)}',
          '${escape(JSON.stringify(log.metadata ?? {}))}'
        );
    `;
  }
}
