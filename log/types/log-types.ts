export type PIIContext = {
  imei: string;
  ip_address: string | null;
  phone_number: string;
}

export type DeviceContext = {
  app_version: string;
  os_version: string;
  boot_id: string;
  on_vpn: boolean;
  on_wifi: boolean;
  device_carrier: string;
  manufacturer: string;
  is_wisephone_set_up: boolean;
  is_cspire_device: boolean;
};

export type KnoxManageProfile = {
  profile_name: string;
  version: number;
}

export type KnoxContext = {
  device_name: string;
  profiles: Array<KnoxManageProfile>;
  organizations: string[];
  groups: string[];
};

export type LogFlushEvent = {
  schema_version: number;
  timestamp: string;
  domain: string;
  event_code: string;
  severity: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | "CRITICAL";
  message: string;
  event_id: string;
  pii: PIIContext;
  device_context: DeviceContext;
  applied_feature_flags: Record<string, unknown>;
  knox_context: KnoxContext;
  metadata: Record<string, unknown>;
}

export type LogFLushPayload = {
  events: LogFlushEvent[],
  batch_id: string
}
