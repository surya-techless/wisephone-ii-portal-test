import { Cache, cache } from "cache/Cache";
import { mysqldb } from '@/db';

import { wiseOSLogEvent } from '@/db/schema';
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
      batch_id: payload.batch_id
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
    const newLogEventData: any[] = [];
    const batchIdentifiers: Set<BatchIdentifier> = new Set();  // no dups

    batches.forEach(
      (batch) => {

        let batchId = batch.batch_id;
        batch.events.forEach(
          (logEvent: LogEvent) => {
            newLogEventData.push(this.prepareLogEventData(logEvent, cache.bufferId, batchId, submissionId))
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
      await mysqldb.insert(wiseOSLogEvent).values(newLogEventData);
      await cache.flush(cache.bufferId);

      // this is an async method but let's not block the thread before returning
      // MQTT-based acknowledgements do not have to be sent synchronously
      sendLogFlushAcks(batchIdentifiers);
    } catch (e) {
      console.error("❌ Log buffer flush failure:", e);
      throw e;
    }
  }

  private static prepareLogEventData(log: LogEvent, bufferId: string, batchId: string, submissionId: string) {
    const defaultRecordStatus: string = "SUCCESS";

    return {
      eventId: log.event_id,
      schemaVersion: log.schema_version,
      eventTimestamp: new Date(log.timestamp),
      imei: log.pii.imei,
      ipAddress: log.pii.ip_address ?? "x.x.x.x",
      appVersion: log.device_context.app_version,
      osVersion: log.device_context.os_version,
      bootId: log.device_context.boot_id,
      deviceName: log.knox_context.device_name,
      domain: log.domain,
      eventCode: log.event_code,
      severity: log.severity,
      status: defaultRecordStatus,
      submissionId: submissionId,
      batchId: batchId,
      bufferId: bufferId,
      message: log.message,
      metadata: log.metadata ?? {},
    };
  }
}
