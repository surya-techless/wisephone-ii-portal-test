/**
 * AWS IoT Core publish helper for the Wisephone Portal.
 * Uses the AWS IoT Data Plane SDK to publish messages to per-device topics.
 * No persistent MQTT client needed on the server — one SDK call per flag change.
 */

import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";

const region = import.meta.env.AWS_REGION;
const endpoint = import.meta.env.AWS_IOT_ENDPOINT;
const accessKeyId = import.meta.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.AWS_SECRET_ACCESS_KEY;

const client =
  endpoint && accessKeyId && secretAccessKey
    ? new IoTDataPlaneClient({
        region,
        endpoint: `https://${endpoint}`,
        credentials: { accessKeyId, secretAccessKey }
      })
    : null;

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
    console.warn("[MQTT] ⚠️  Client not initialized — AWS env vars missing. Skipping publish.");
    console.warn(`[MQTT]    AWS_IOT_ENDPOINT  : ${endpoint || "NOT SET"}`);
    console.warn(`[MQTT]    AWS_ACCESS_KEY_ID : ${accessKeyId ? accessKeyId.slice(0, 8) + "..." : "NOT SET"}`);
    console.warn(`[MQTT]    AWS_SECRET_ACCESS_KEY : ${secretAccessKey ? "SET" : "NOT SET"}`);
    return;
  }

  const topic = `devices/${imei}/feature-flags`;
  const payload = JSON.stringify({ ...flags, updatedAt: new Date().toISOString() });

  console.log(`[MQTT] Broker  : https://${endpoint}`);
  console.log(`[MQTT] Topic   : ${topic}`);
  console.log(`[MQTT] IMEI    : ${imei}`);
  console.log(`[MQTT] Flags   :`, JSON.stringify(flags, null, 2));

  try {
    await client.send(
      new PublishCommand({
        topic,
        payload: new TextEncoder().encode(payload),
        qos: 1
      })
    );
    console.log(`[MQTT] ✅ Published successfully to ${topic}`);
  } catch (err) {
    // Non-fatal — device will pick up change on next fallback poll
    console.error("[MQTT] ❌ Publish error:", err);
  }
}
