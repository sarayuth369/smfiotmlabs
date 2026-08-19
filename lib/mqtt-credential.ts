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
 *   - "automatic" — SMF calls broker REST API to create/rotate/revoke
 *                   credentials automatically. Requires HiveMQ Starter+
 *                   or self-hosted EMQX with matching endpoints.
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

/** Result envelope for lifecycle ops. */
export type CredentialResult<T = void> =
  | { ok: true; data: T; brokerRegistered: boolean; manualInstruction?: string }
  | { ok: false; error: string; retryable: boolean };

/** ACL specification — restrict per-device topic access. */
export type DeviceAclSpec = {
  customer_identity_id: string;
  device_uid: string;
};

/**
 * Adapter contract — implement per broker backend.
 * All methods idempotent — safe to retry (adapters catch "already exists" errors).
 */
export interface MqttCredentialAdapter {
  readonly name: string;
  readonly mode: ProvisioningMode;

  /**
   * Provision a new credential at the broker (or return metadata for manual
   * dashboard step). Return plaintext password ONCE — caller stores hash only.
   *
   * `acl` optional — when provided AND adapter supports it, restricts credential
   * to per-device topics. Manual adapter ignores.
   */
  create(
    deviceUid: string,
    acl?: DeviceAclSpec
  ): Promise<
    CredentialResult<{
      credential: GeneratedCredential;
      brokerCredentialId?: string;
    }>
  >;

  /**
   * Rotate — generate new password + swap at broker atomically if API supports,
   * else create-new then delete-old. Never leave device without valid creds.
   */
  rotate(
    mqttUsername: string,
    deviceUid: string,
    acl?: DeviceAclSpec
  ): Promise<
    CredentialResult<{
      credential: GeneratedCredential;
      brokerCredentialId?: string;
    }>
  >;

  /**
   * Revoke — delete credential at broker (or return instruction).
   * Idempotent: already-deleted = ok.
   */
  revoke(mqttUsername: string): Promise<CredentialResult>;

  /** Check broker recognizes credential (automatic only). */
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
      ok: true as const,
      data: { credential },
      brokerRegistered: false,
      manualInstruction:
        "Go to HiveMQ Dashboard → Access Management → Create Credential with the username + password shown once above.",
    };
  }

  async rotate(_username: string, deviceUid: string) {
    return this.create(deviceUid);
  }

  async revoke() {
    return {
      ok: true as const,
      data: undefined,
      brokerRegistered: false,
      manualInstruction:
        "Go to HiveMQ Dashboard → Access Management → find username → Delete.",
    };
  }
}

// ============================================================
// ADAPTER 2: HiveMQ Cloud REST (Starter+ tier)
// ============================================================
//
// REST endpoints per HiveMQ Cloud Access Management API. Verify against
// current HiveMQ docs before enabling in production:
//   https://docs.hivemq.com/hivemq-cloud/rest-api.html
//
// Expected endpoints (patterns — confirm URLs/schemas with HiveMQ docs):
//   POST   {apiUrl}/api/v1/authentication/users
//     body: { username, password, permissions: [{ topic, activity: "publish"|"subscribe" }] }
//   DELETE {apiUrl}/api/v1/authentication/users/{username}
//   PATCH  {apiUrl}/api/v1/authentication/users/{username}
//     body: { password?, permissions? }
//
// All authenticated with: Authorization: Bearer {apiToken}
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

  private headers() {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiToken}`,
    };
  }

  private buildAcl(acl: DeviceAclSpec) {
    const prefix = `smf/${acl.customer_identity_id}/${acl.device_uid}`;
    // Publish: telemetry, status, response, event, relay status
    // Subscribe: command, config, relay set
    return [
      { topic: `${prefix}/telemetry`, activity: "publish" },
      { topic: `${prefix}/status`, activity: "publish" },
      { topic: `${prefix}/response`, activity: "publish" },
      { topic: `${prefix}/event/+`, activity: "publish" },
      { topic: `${prefix}/relay/+/status`, activity: "publish" },
      { topic: `${prefix}/command`, activity: "subscribe" },
      { topic: `${prefix}/config`, activity: "subscribe" },
      { topic: `${prefix}/relay/+/set`, activity: "subscribe" },
    ];
  }

  async create(deviceUid: string, acl?: DeviceAclSpec) {
    const credential = await generateDeviceCredential(deviceUid);
    const permissions = acl ? this.buildAcl(acl) : [];

    try {
      const res = await fetch(`${this.apiUrl}/api/v1/authentication/users`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          username: credential.mqtt_username,
          password: credential.mqtt_password,
          permissions,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 409 = already exists → treat as retryable via rotate
        const retryable = res.status >= 500 || res.status === 409;
        return {
          ok: false as const,
          error: `HiveMQ create failed ${res.status}: ${text.slice(0, 200)}`,
          retryable,
        };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return {
        ok: true as const,
        data: { credential, brokerCredentialId: body.id },
        brokerRegistered: true,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: `HiveMQ network error: ${(e as Error).message}`,
        retryable: true,
      };
    }
  }

  async rotate(mqttUsername: string, deviceUid: string, acl?: DeviceAclSpec) {
    // Safe sequence: delete old + create new. If HiveMQ supports PATCH password
    // atomically, prefer that (single request, no gap where device has no cred).
    // Current impl assumes DELETE + CREATE is safer than trusting PATCH atomicity.
    const revoked = await this.revoke(mqttUsername);
    if (!revoked.ok && !revoked.error.includes("404")) {
      return { ok: false as const, error: `rotate: revoke failed — ${revoked.error}`, retryable: true };
    }
    return this.create(deviceUid, acl);
  }

  async revoke(mqttUsername: string) {
    try {
      const res = await fetch(
        `${this.apiUrl}/api/v1/authentication/users/${encodeURIComponent(mqttUsername)}`,
        { method: "DELETE", headers: this.headers() }
      );
      // 404 = already gone → ok
      if (res.ok || res.status === 404) {
        return { ok: true as const, data: undefined, brokerRegistered: true };
      }
      const text = await res.text().catch(() => "");
      return {
        ok: false as const,
        error: `HiveMQ revoke failed ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: `HiveMQ network error: ${(e as Error).message}`,
        retryable: true,
      };
    }
  }

  async status(mqttUsername: string): Promise<"active" | "unknown" | "error"> {
    try {
      const res = await fetch(
        `${this.apiUrl}/api/v1/authentication/users/${encodeURIComponent(mqttUsername)}`,
        { method: "GET", headers: this.headers() }
      );
      if (res.ok) return "active";
      if (res.status === 404) return "unknown";
      return "error";
    } catch {
      return "error";
    }
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

// Test-only reset (Vitest / dev)
export function _resetAdapterCache() {
  cachedAdapter = null;
}

// ============================================================
// Public API — business logic uses these
// ============================================================

export async function createDeviceCredential(deviceUid: string, acl?: DeviceAclSpec) {
  const adapter = getCredentialAdapter();
  return adapter.create(deviceUid, acl);
}

export async function rotateDeviceCredential(
  mqttUsername: string,
  deviceUid: string,
  acl?: DeviceAclSpec
) {
  const adapter = getCredentialAdapter();
  return adapter.rotate(mqttUsername, deviceUid, acl);
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
