/**
 * LINE Messaging API push helper.
 * https://developers.line.biz/en/reference/messaging-api/#send-push-message
 */

export type LinePushResult =
  | { ok: true }
  | { ok: false; error: string };

export async function pushLineText(
  channelAccessToken: string,
  to: string,
  text: string
): Promise<LinePushResult> {
  if (!channelAccessToken || !to) {
    return { ok: false, error: "LINE token or target ID missing" };
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: text.slice(0, 4900) }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `LINE ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}
