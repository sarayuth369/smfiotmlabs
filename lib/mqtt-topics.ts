/**
 * MQTT topic builder — server + client safe (pure functions, no env deps).
 *
 * Supports 2 namespace patterns:
 *
 * 1. LEGACY (single-tenant, hardcoded firmware topic set)
 *    farm/temp, farm/humidity, farm/light, farm/soil, farm/power
 *    farm/device/status, farm/relay/{ch}/{set|status}
 *    farm/config/{schedule|rules|sheets|line}, farm/cmd/{wifi_reset|restart}
 *
 * 2. NEW multi-tenant (device UID + customer identity scoped)
 *    smf/{customer_identity_id}/{device_uid}/{kind}
 *    smf/{customer_identity_id}/{device_uid}/relay/{ch}/{set|status}
 *    smf/{customer_identity_id}/{device_uid}/event/{type}
 *
 * `iot_nodes` may store `mqtt_topic_prefix` (denormalized). If null, legacy
 * device — resolved via `legacy_device_mappings.legacy_topic_prefix`.
 */

export type TopicKind =
  | "telemetry"
  | "status"
  | "command"
  | "response"
  | "config"
  | "event";

export type LegacyTopicKind =
  | "temp"
  | "humidity"
  | "light"
  | "soil"
  | "power"
  | "device/status";

export const NEW_NAMESPACE = "smf";
export const LEGACY_NAMESPACE = "farm";

/** New namespace — used by future firmware once UID+customer prefix supported. */
export function buildTopic(
  customerIdentityId: string,
  deviceUid: string,
  kind: TopicKind,
  extra?: string
): string {
  const base = `${NEW_NAMESPACE}/${customerIdentityId}/${deviceUid}/${kind}`;
  return extra ? `${base}/${extra}` : base;
}

/** New namespace relay topics: smf/{cust}/{uid}/relay/{ch}/{set|status} */
export function buildRelayTopic(
  customerIdentityId: string,
  deviceUid: string,
  channel: number,
  direction: "set" | "status"
): string {
  return `${NEW_NAMESPACE}/${customerIdentityId}/${deviceUid}/relay/${channel}/${direction}`;
}

/** Legacy hardcoded topics — 1 broker, 1 device only. */
export function buildLegacyTopic(
  kind: LegacyTopicKind | string,
  legacyPrefix: string = "farm"
): string {
  return `${legacyPrefix}/${kind}`;
}

/** Legacy relay topics: {prefix}/relay/{ch}/{set|status} */
export function buildLegacyRelayTopic(
  channel: number,
  direction: "set" | "status",
  legacyPrefix: string = "farm"
): string {
  return `${legacyPrefix}/relay/${channel}/${direction}`;
}

/**
 * Bridge subscribe patterns — subscribe both legacy + new during migration.
 * Bridge worker uses this list to subscribe on connect.
 */
export const BRIDGE_SUBSCRIBE_PATTERNS = [
  // Legacy (existing SMF001 test unit)
  "farm/temp",
  "farm/humidity",
  "farm/light",
  "farm/soil",
  "farm/power",
  "farm/device/status",
  "farm/relay/+/status",
  // New multi-tenant (future customer devices)
  "smf/+/+/telemetry",
  "smf/+/+/status",
  "smf/+/+/response",
  "smf/+/+/event/+",
  "smf/+/+/relay/+/status",
] as const;

/**
 * Parse a topic string → structured route.
 * Returns null if topic doesn't match any known pattern.
 */
export type ParsedTopic =
  | { kind: "legacy"; sub: string; parts: string[] }
  | {
      kind: "new";
      customerIdentityId: string;
      deviceUid: string;
      topicKind: string;
      extra: string[];
    }
  | null;

export function parseTopic(topic: string): ParsedTopic {
  const parts = topic.split("/");
  if (parts.length < 2) return null;

  if (parts[0] === LEGACY_NAMESPACE) {
    return { kind: "legacy", sub: parts.slice(1).join("/"), parts: parts.slice(1) };
  }

  if (parts[0] === NEW_NAMESPACE && parts.length >= 4) {
    return {
      kind: "new",
      customerIdentityId: parts[1],
      deviceUid: parts[2],
      topicKind: parts[3],
      extra: parts.slice(4),
    };
  }

  return null;
}

/** MQTT client ID convention (per-device unique). */
export function buildClientId(deviceUid: string): string {
  return `smf_device_${deviceUid}`;
}
