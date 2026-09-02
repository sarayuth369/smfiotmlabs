/**
 * Shared constants/helpers for the admin remote-command system
 * (device_commands table, smf/{c}/{d}/cmd/admin + event/admin_cmd).
 */

export const ADMIN_COMMAND_TYPES = [
  "get_status",
  "run_diagnostics",
  "test_sensors",
  "restart_mqtt",
  "reboot_device",
] as const;
export type AdminCommandType = (typeof ADMIN_COMMAND_TYPES)[number];

export const ADMIN_COMMAND_LABEL: Record<AdminCommandType, string> = {
  get_status: "Refresh Device Status",
  run_diagnostics: "Run Full Diagnostics",
  test_sensors: "Test Sensors",
  restart_mqtt: "Restart MQTT",
  reboot_device: "Reboot Device",
};

/**
 * Non-terminal statuses time out client-visibly after this many seconds —
 * computed lazily at read time (same pattern as lib/device-status.ts's
 * freshness check), no cron needed. reboot_device gets longer because it
 * has to survive a full WiFi+MQTT reconnect cycle, not just one round trip.
 */
export const COMMAND_TIMEOUT_SEC: Record<string, number> = {
  get_status: 20,
  run_diagnostics: 25,
  test_sensors: 20,
  restart_mqtt: 45,
  reboot_device: 90,
};
const DEFAULT_TIMEOUT_SEC = 30;

const NON_TERMINAL = new Set(["pending", "sent", "acknowledged", "running"]);

/** Lazily-computed status — never written back to the DB, just for display. */
export function effectiveCommandStatus(
  command: string,
  status: string,
  requestedAt: string
): string {
  if (!NON_TERMINAL.has(status)) return status;
  const timeoutSec = COMMAND_TIMEOUT_SEC[command] ?? DEFAULT_TIMEOUT_SEC;
  const ageSec = (Date.now() - new Date(requestedAt).getTime()) / 1000;
  return ageSec > timeoutSec ? "timeout" : status;
}
