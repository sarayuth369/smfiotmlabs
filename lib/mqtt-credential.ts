/**
 * MQTT Credential Service — broker-agnostic abstraction.
 *
 * Business logic depends on this interface, not on HiveMQ specifics.
 * Swap adapters (HiveMQ Cloud REST, self-hosted EMQX, Mosquitto, etc.)
 * by implementing `MqttCredentialAdapter` and wiring at bootstrap.
 *
 * Provisioning mode controlled by env `MQTT_PROVISIONING_MODE`:
 *   - "manual"    (default) — SMF generates username/password + hashes it;
 *                            admin must add matching credential in HiveMQ
 *                            Dashboard. Suitable for HiveMQ Free tier.
 *   - "automatic" (future)  — SMF calls broker REST API to create/rotate
 *                            credentials automatically. Requires HiveMQ
 *                            Starter+ or self-hosted EMQX.
 *
 * Server-only. Never import from client — bcrypt + service_role in use.
 */

import { generateDeviceCredential, type GeneratedCredential } from "@/lib/device-auth";

export type ProvisioningMode = "manual" | "automatic";

export function getProvisioningMode(): ProvisioningMode {
  return (process.env.MQTT_PROVISIONING_MODE as ProvisioningMode) ?? "manual";
}

/** Metadata stored in SMF DB. Never plaintext password. */
export type CredentialMetadata = {
  mqtt_username: string;
  mqtt_password_hash: string;
  mqtt_password_prefix: string;
  mqtt_password_last4: string;
};

/**
 * Adapter contract — implement per broker backend.
 * All methods idempotent — safe to retry.
 */
export interface MqttCredentialAdapter {
  readonly name: string;
  readonly mode: ProvisioningMode;

  /**
   * Provision a new credential at the broker (or return metadata for manual
   * dashboard step). Return plaintext password ONCE — caller stores hash only.
   */
  create(deviceUid: string): Promise<{
    credential: GeneratedCredential;
    brokerRegistered: boolean;
    manualInstruction?: string;
  }>;

  /**
   * Revoke credential at broker (delete username). Manual mode returns
   * instruction for admin. Automatic mode deletes via REST.
   */
  revoke(mqttUsername: string): Promise<{
    ok: boolean;
    manualInstruction?: string;
    error?: string;
  }>;

  /** Check if broker recognizes credential (automatic only). */
  status?(mqttUsername: string): Promise<"active" | "unknown" | "error">;
}

// ============================================================
// ADAPTER 1: Manual (HiveMQ Free tier fallback)
// ============================================================

class ManualAdapter implements MqttCredentialAdapter {
  readonly name = "manual";
  readonly mode: ProvisioningMode = "manual";

  async create(deviceUid: string) {
    const credential = await generateDeviceCredential(deviceUid);
    return {
      credential,
      brokerRegistered: false,
      manualInstruction:
        "Go to HiveMQ Dashboard → Access Management → Create Credential with the username + password shown once above.",
    };
  }

  async revoke() {
    return {
      ok: false,
      manualInstruction:
        "Go to HiveMQ Dashboard → Access Management → find username → Delete.",
    };
  }
}

// ============================================================
// ADAPTER 2: HiveMQ Cloud REST (Starter+ tier, future)
// ============================================================

class HivemqCloudAdapter implements MqttCredentialAdapter {
  readonly name = "hivemq-cloud";
  readonly mode: ProvisioningMode = "automatic";

  private readonly apiUrl: string;
  private readonly apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiToken = apiToken;
  }

  async create(deviceUid: string) {
    const credential = await generateDeviceCredential(deviceUid);
    // NOTE: implementation deferred until HiveMQ Starter subscribed.
    // Contract when enabled:
    //   POST {apiUrl}/api/v1/authentication/users
    //     { username, password, permissions: [{topic: `smf/+/${deviceUid}/#`, ...}] }
    return {
      credential,
      brokerRegistered: false,
      manualInstruction:
        "HivemqCloudAdapter.create() not yet implemented — waiting for Starter tier + REST token. Falling back to manual.",
    };
  }

  async revoke(mqttUsername: string) {
    // NOTE: contract when enabled:
    //   DELETE {apiUrl}/api/v1/authentication/users/{username}
    return {
      ok: false,
      manualInstruction: `HivemqCloudAdapter.revoke("${mqttUsername}") not yet implemented — manual dashboard step required.`,
    };
  }

  async status(): Promise<"active" | "unknown" | "error"> {
    return "unknown";
  }
}

// ============================================================
// Factory — pick adapter by env
// ============================================================

let cachedAdapter: MqttCredentialAdapter | null = null;

export function getCredentialAdapter(): MqttCredentialAdapter {
  if (cachedAdapter) return cachedAdapter;

  const mode = getProvisioningMode();
  if (mode === "automatic") {
    const url = process.env.HIVEMQ_MGMT_API_URL;
    const token = process.env.HIVEMQ_MGMT_API_TOKEN;
    if (url && token) {
      cachedAdapter = new HivemqCloudAdapter(url, token);
      return cachedAdapter;
    }
    console.warn(
      "[mqtt-credential] mode=automatic but HIVEMQ_MGMT_API_URL/TOKEN not set — falling back to manual"
    );
  }

  cachedAdapter = new ManualAdapter();
  return cachedAdapter;
}

// ============================================================
// Public API — business logic uses these
// ============================================================

export async function createDeviceCredential(deviceUid: string) {
  const adapter = getCredentialAdapter();
  return adapter.create(deviceUid);
}

export async function revokeDeviceCredential(mqttUsername: string) {
  const adapter = getCredentialAdapter();
  return adapter.revoke(mqttUsername);
}

/** Extract storable metadata (never returns plaintext) from GeneratedCredential. */
export function toCredentialMetadata(c: GeneratedCredential): CredentialMetadata {
  return {
    mqtt_username: c.mqtt_username,
    mqtt_password_hash: c.mqtt_password_hash,
    mqtt_password_prefix: c.mqtt_password_prefix,
    mqtt_password_last4: c.mqtt_password.slice(-4),
  };
}
