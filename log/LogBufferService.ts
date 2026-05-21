import { CacheClient } from "cache/CacheClient";
import { TursoClient } from "db/client/client";

import { sendLogFlushAcks } from "@/libs/mqtt";
import type { LogEvent } from "cache/dto/LogEvent";


export class LogBufferService {
  public static async ingest(payload: any): Promise<void> {
    payload = payload.events;
    await CacheClient.push(JSON.stringify(payload));
    const bufferSize = await CacheClient.getBufferSize();

    if (bufferSize >= CacheClient.bufferSizeNumKeys) {
      await this.flush();
      console.log("cache flushed");
    }
  }

  private static async flush(): Promise<void> {
    //  TODO:
    //    confirm imei in payload
    const globallyCachedLogs = await CacheClient.getAll();  // NOTE: each log event item in cache will be an array of a file dump of on-device log events

    if (globallyCachedLogs.length === 0) {
      return;
    }

    const batches = globallyCachedLogs.map((batch) => JSON.parse(JSON.parse(batch)));
    const sqlStatements: string[] = [];
    const mqttAckTopics: Set<string> = new Set();  // no dups

    batches.forEach(
      (batch) => {
        batch.forEach((logEvent: LogEvent) => {
          sqlStatements.push(this.buildInsertStatement(logEvent))
          // <device imei>-<random uuid>
          // // example: 1234512345123-50657e75-545c-4fe3-941b-18bc4fde1c4a
          mqttAckTopics.add(logEvent.batch_id);
        });
      });

    let dbConnection = null;
    try {
      dbConnection = TursoClient.connection();
      await dbConnection.batch(sqlStatements);
      await CacheClient.flush(globallyCachedLogs.length);
      sendLogFlushAcks(mqttAckTopics);

    } catch (e) {
        console.error("Bulk insert failed:", e);
        throw e;
    } finally {
      if (dbConnection) {
        dbConnection.close();
      }
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
