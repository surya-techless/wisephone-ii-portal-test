/**
 * AWS IoT Core publish helper for the Wisephone Portal.
 * Uses the AWS IoT Data Plane SDK to publish messages to per-device topics.
 * No persistent MQTT client needed on the server — one SDK call per flag change.
 */

import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import { devLog } from "@/libs/utils";
import { WPIIPortalAPIError } from "@/lib/server/api.response";

import type { BatchIdentifier } from "log/LogBufferService";


export class WPIIPortalMQTTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WPIIPortalMQTTError";
  }
}

const region = import.meta.env.WPII_AWS_IOT_REGION;
const endpoint = import.meta.env.WPII_AWS_IOT_ENDPOINT;
const accessKeyId = import.meta.env.WPII_AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.WPII_AWS_SECRET_ACCESS_KEY;
const sysprobeAccessKeyId = import.meta.env.WPII_SYSPROBE_AWS_ACCESS_KEY_ID;
const sysprobeSecretAccessKey = import.meta.env.WPII_SYSPROBE_AWS_SECRET_ACCESS_KEY;

const client =
  endpoint && accessKeyId && secretAccessKey
    ? new IoTDataPlaneClient({
      region,
      endpoint: `https://${endpoint}`,
      credentials: { accessKeyId, secretAccessKey }
    })
    : null;

// seperate concerns with dedicated sysprobe IAM access keys
const sysprobeClient = endpoint && sysprobeAccessKeyId && sysprobeSecretAccessKey ? new IoTDataPlaneClient({
  region,
  endpoint: `https://${endpoint}`,
  credentials: { accessKeyId: sysprobeAccessKeyId, secretAccessKey: sysprobeSecretAccessKey }
}) : null;

/**
 * Publish feature flags to a specific device via AWS IoT Core.
 * Topic: devices/{imei}/feature-flags
 * Called after every successful DeviceFeatureFlags DB write.
 */
export async function publishFeatureFlags(
  imei: string,
  flags: Record<string, number>
): Promise<void> {
  if (!client) {
    devLog.warn("[MQTT] ⚠️  Client not initialized — AWS env vars missing. Skipping publish.");
    devLog.warn(`[MQTT]    AWS_IOT_ENDPOINT  : ${endpoint || "NOT SET"}`);
    devLog.warn(`[MQTT]    AWS_ACCESS_KEY_ID : ${accessKeyId ? accessKeyId.slice(0, 8) + "..." : "NOT SET"}`);
    devLog.warn(`[MQTT]    AWS_SECRET_ACCESS_KEY : ${secretAccessKey ? "SET" : "NOT SET"}`);
    return;
  }

  const topic = `devices/${imei}/feature-flags`;
  const payload = JSON.stringify({ ...flags, updatedAt: new Date().toISOString() });

  devLog.log(`[MQTT] Broker  : https://${endpoint}`);
  devLog.log(`[MQTT] Topic   : ${topic}`);
  devLog.log(`[MQTT] IMEI    : ${imei}`);
  devLog.log(`[MQTT] Flags   :`, JSON.stringify(flags, null, 2));

  try {
    await client.send(
      new PublishCommand({
        topic,
        payload: new TextEncoder().encode(payload),
        qos: 1
      })
    );
    devLog.log(`[MQTT] ✅ Published successfully to ${topic}`);
  } catch (err) {
    // Non-fatal — device will pick up change on next fallback poll
    devLog.error("[MQTT] ❌ Publish error:", err);
  }
}

export async function sendSysProbe(initialSignalPayload: any) {
  const topic = `sysprobe/probe`;

  if (!sysprobeClient) {
    devLog.warn("[MQTT] ⚠️  Client not initialized — AWS env vars missing. Skipping publish.");
    devLog.warn(`[MQTT]    AWS_IOT_ENDPOINT  : ${endpoint || "NOT SET"}`);
    devLog.warn(`[MQTT]    WPII_SYSPROBE_AWS_ACCESS_KEY_ID : ${sysprobeAccessKeyId ? sysprobeAccessKeyId.slice(0, 8) + "..." : "NOT SET"}`);
    devLog.warn(`[MQTT]    WPII_SYSPROBE_AWS_SECRET_ACCESS_KEY : ${sysprobeSecretAccessKey ? "SET" : "NOT SET"}`);
    throw new WPIIPortalAPIError("Unauthorized");
  }

  try {
    await sysprobeClient.send(
      new PublishCommand({
        topic,
        payload: new TextEncoder().encode(JSON.stringify({
          ...initialSignalPayload,
          portalSysprobeSignalMQTTPublishedAt: new Date().toISOString()
        })),
        qos: 1
      })
    );
    devLog.log(`[MQTT] ✅ heartbeat published successfully to ${topic}`);
  } catch (err) {
    devLog.error("[MQTT] ❌ heartbeat publish error:", err);
    throw new WPIIPortalMQTTError(`there was an issue publishing heartbeat to AWS IoT broker: ${err}`);
  }
}

// portal to send acknowledgements that logs have been successfully committed to db
// this is to let mqtt-subscribed end user devices know when local log deletion is ok
export async function sendLogFlushAcks(identifiers: Set<BatchIdentifier>): Promise<void> {
    identifiers.forEach(async (identifier) => {
      let topic: string = identifier.topic;
      let payload = JSON.stringify(
        {
          message: "ack",
          ackSentAt: Date.now(),
          batchId: identifier.batchId,
          publisher: "wisephone-portal"
        }
      );

      if (client) {
        try {
          await client.send(
            new PublishCommand({
              topic,
              payload: new TextEncoder().encode(payload),
              qos: 1
            })
          );
          console.log(`[MQTT] ✅ log flush event ack publish success: ${topic}`);
        } catch (err) {
          devLog.error("[MQTT] ❌ log flush event ack publish error:", err);
          throw new WPIIPortalMQTTError(`there was an issue publishing log flush event ack to AWS IoT broker: ${err}`);
        }
      }
    });
}
