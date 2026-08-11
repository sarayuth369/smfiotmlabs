/**
 * LINE Messaging API helpers.
 * Docs: https://developers.line.biz/en/reference/messaging-api/
 */

export type LinePushResult =
  | { ok: true }
  | { ok: false; error: string };

async function callLine(
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<LinePushResult> {
  if (!token) return { ok: false, error: "LINE channel access token missing" };
  try {
    const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `LINE ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}

/** Send to ALL followers of the OA (no target needed). */
export async function broadcastLineText(
  token: string,
  text: string
): Promise<LinePushResult> {
  return callLine("message/broadcast", token, {
    messages: [{ type: "text", text: text.slice(0, 4900) }],
  });
}

/** Push to a specific groupId (starts with C) or userId (starts with U). */
export async function pushLineText(
  token: string,
  to: string,
  text: string
): Promise<LinePushResult> {
  if (!to) return { ok: false, error: "target ID missing" };
  return callLine("message/push", token, {
    to,
    messages: [{ type: "text", text: text.slice(0, 4900) }],
  });
}
