/**
 * MQTT publish helper for the Wisephone Portal.
 * Uses the EMQX REST API to publish messages to device topics.
 * No persistent MQTT client needed on the server — one HTTP call per flag change.
 */

const EMQX_REST_URL = import.meta.env.MQTT_BROKER_REST_URL; // e.g. http://localhost:18083
const EMQX_API_KEY = import.meta.env.MQTT_API_KEY;
const EMQX_API_SECRET = import.meta.env.MQTT_API_SECRET;

/**
 * Publish feature flags to a specific device via MQTT.
 * Topic: devices/{imei}/feature-flags
 * Called after every successful DeviceFeatureFlags DB write.
 */
export async function publishFeatureFlags(
  imei: string,
  flags: Record<string, number>
): Promise<void> {
  if (!EMQX_REST_URL || !EMQX_API_KEY || !EMQX_API_SECRET) {
    console.warn("[MQTT] Broker env vars not set — skipping publish");
    return;
  }

  const topic = `devices/${imei}/feature-flags`;
  const payload = JSON.stringify({ ...flags, updatedAt: new Date().toISOString() });

  try {
    const credentials = btoa(`${EMQX_API_KEY}:${EMQX_API_SECRET}`);
    const response = await fetch(`${EMQX_REST_URL}/api/v5/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`
      },
      body: JSON.stringify({
        topic,
        payload,
        qos: 1,
        retain: false
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[MQTT] Publish failed (${response.status}):`, text);
    } else {
      console.log(`[MQTT] Published to ${topic}`);
    }
  } catch (err) {
    // Non-fatal — device will pick up change on next fallback poll
    console.error("[MQTT] Publish error:", err);
  }
}
