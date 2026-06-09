import { v7 } from 'uuid';
import { Cache, cache } from "cache/Cache";
import { tursoDb } from "db/TursoDb";

import { sendLogFlushAcks } from "@/libs/mqtt";
import type { LogEvent } from "cache/dto/LogEvent";

import type { LogFlushEvent, LogFLushPayload } from "./types/log-types";


export type BatchIdentifier = {
  topic: string,
  batchId: string,
  bufferId: string,
  submissionId: string;
};

export const LogFlushSeverityCodesForCommit = ["ERROR", "FATAL", "CRITICAL"];


export class LogBufferService {
  public static async ingest(payload: LogFLushPayload): Promise<void> {
    // we only care about persisting serious events since crashlytcis will contain ALL logs including debug and info logs
    let seriousLogEvents = payload.events.filter((e: LogFlushEvent) => LogFlushSeverityCodesForCommit.includes(e.severity));
    await cache.push(cache.bufferId, JSON.stringify({
      events: seriousLogEvents,
      batch_id:  payload.batch_id
    }));
    const bufferSize = await cache.getBufferSize(cache.bufferId);

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
    const bufferedLogs = await cache.getAllBufferContents(cache.bufferId);

      // NOTE: even across many compute instance in our serverless env,
      // av4 uuid should still offer sufficient entropy such that submission id's enver clash
    const submissionId: string = crypto.randomUUID();

    if (bufferedLogs.length === 0) {
      console.warn("⚠️ log buffer empty");
      return;
    }

    const batches = bufferedLogs.map((batch) => JSON.parse(batch));
    const sqlStatements: string[] = [];
    const batchIdentifiers: Set<BatchIdentifier> = new Set();  // no dups

    batches.forEach(
      (batch) => {

        let batchId = batch.batch_id;
        batch.events.forEach(
          (logEvent: LogEvent) => {
            sqlStatements.push(this.buildInsertStatement(logEvent, cache.bufferId, batchId, submissionId))
            batchIdentifiers.add({
              topic: `log/flush/${logEvent.pii.imei}/ack`,
              batchId: batchId,
              bufferId: cache.bufferId,
              submissionId: submissionId
            });
          });
      });

    try {
      // batch log flush and db commit to keep write amplification to a minimum
      await tursoDb.batch(sqlStatements);
      await cache.flush(cache.bufferId);

      // this is an async method but let's not block the thread before returning
      // MQTT-based acknowledgements do not have to be sent synchronously
      sendLogFlushAcks(batchIdentifiers);
    } catch (e) {
        console.error("❌ Log buffer flush failure:", e);
        throw e;
    }
  }

  private static buildInsertStatement(log: LogEvent, bufferId: string, batchId: string, submissionId: string) {
    const defaultRecordStatus: string = "SUCCESS";
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) {
        return "";
      }

      return String(v).replace(/'/g, "''");
    };

    return `
      INSERT INTO WiseOSLogEvent (
        event_id, schema_version, event_timestamp, imei, ip_address, app_version, os_version, boot_id, device_name, domain, event_code, severity, status, submission_id, batch_id, buffer_id, message, metadata
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
          '${escape(defaultRecordStatus)}',
          '${escape(submissionId)}',
          '${escape(batchId)}',
          '${escape(bufferId)}',
          '${escape(log.message)}',
          '${escape(JSON.stringify(log.metadata ?? {}))}'
        );
    `;
  }
}
