/**
 * AWS IoT Core publish helper for the Wisephone Portal.
 * Uses the AWS IoT Data Plane SDK to publish messages to per-device topics.
 * No persistent MQTT client needed on the server — one SDK call per flag change.
 */

import * as os from 'os';
import { auth, mqtt, iot, io } from 'aws-iot-device-sdk-v2';
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import { devLog } from "@/libs/utils";
import { WisephoneIIPortalAPIError } from "@/lib/server/api.response";


export class WisephoneIIPortalMQTTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WisephoneIIPortalMQTTError";
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

// ----------------------------------------------------------------------------------------------------------------------------------------------------------
// relies on the extremely robust AWS `aws-iot-device-sdk-v2` npm package
// uses the same credentials as `wiseos-portal-publisher` user
const clientId = os.hostname();
const provider = auth.AwsCredentialsProvider.newStatic(accessKeyId, secretAccessKey);
const config = iot.AwsIotMqttConnectionConfigBuilder.new_with_websockets({ region: region, credentials_provider: provider })
  .with_client_id(clientId)
  .with_endpoint(endpoint)
  .with_clean_session(true)
  .build();

const robustMQTTClient = new mqtt.MqttClient();
const robustMQTTConnection = robustMQTTClient.new_connection(config);

robustMQTTConnection.on('connect', () => console.log('[MQTT] CONNECT'));
robustMQTTConnection.on('disconnect', () => console.log('[MQTT] DISCONNECT'));
robustMQTTConnection.on('interrupt', (error) => console.log('[MQTT] INTERRUPT', error));
robustMQTTConnection.on('resume', (returnCode, sessionPresent) => console.log('[MQTT] RESUME', 'returnCode=', returnCode, 'sessionPresent=', sessionPresent));
robustMQTTConnection.on('error', (error) => console.log('[MQTT] ERROR', error));
robustMQTTConnection.on('message', (topic, payload) => console.log('[MQTT] MESSAGE', topic, new TextDecoder().decode(payload)));
robustMQTTConnection.on('closed', () => console.log('[MQTT] CLOSED'));
await robustMQTTConnection.connect();
// ----------------------------------------------------------------------------------------------------------------------------------------------------------

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
    throw new WisephoneIIPortalAPIError("Unauthorized");
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
    throw new WisephoneIIPortalMQTTError(`there was an issue publishing heartbeat to AWS IoT broker: ${err}`);
  }
}

export async function sendLogFlushAcks(suffixes: Set<string>): Promise<void> {
  try {
    suffixes.forEach(async (suffix) => {
      let topic: string = `log/flush/${suffix}/ack`;
      if (robustMQTTConnection) {
        await robustMQTTConnection.publish(topic, JSON.stringify(
          {
            message: "ack",
            ackSentAt: Date.now(),
            suffix: suffix
          }
        ), mqtt.QoS.AtLeastOnce);
        console.log(`[MQTT] ✅ log flush event ack publish success: ${topic}`);
      }
    });
  } catch (err) {
    devLog.error("[MQTT] ❌ log flush event ack publish error:", err);
    throw new WisephoneIIPortalMQTTError(`there was an issue publishing log flush event ack to AWS IoT broker: ${err}`);
  }
}
