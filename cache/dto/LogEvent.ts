export type LogEvent = {
  schema_version: number;
  timestamp: string;
  domain: string;
  event_code: string;
  severity: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
  message: string;
  event_id: string;

  pii: {
    imei: string;
    ip_address: string;
  };

  device_context: {
    app_version: string;
    os_version: string;
    boot_id: string;
    on_vpn: boolean;
    on_wifi: boolean;
    device_carrier: string;
    manufacturer: string;
    is_set_up: boolean;
    is_cspire_device: boolean;
  };

  applied_feature_flags: Record<string, unknown>;

  knox_context: {
    device_name: string;

    profiles: Array<{
      profile_name: string;
      version: number;
    }>;

    organizations: string[];
    groups: string[];
  };

  metadata: Record<string, unknown>;
}
