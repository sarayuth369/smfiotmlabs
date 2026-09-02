/**
 * Firebase Cloud Messaging (mobile push) — mirrors lib/line.ts's shape.
 * Firebase is used ONLY for message transport (FCM). Supabase remains
 * the single source of truth for notification content/history
 * (public.notifications) — this module never reads/writes anything
 * except sending a push to a set of device tokens.
 */
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let app: App | null = null;

function getFirebaseApp(): App | null {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    app = getApps().length > 0 ? getApps()[0]! : initializeApp({ credential: cert(serviceAccount) });
    return app;
  } catch (e) {
    console.warn("[fcm] invalid FIREBASE_SERVICE_ACCOUNT_JSON", (e as Error).message);
    return null;
  }
}

export function isFcmReady(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
}

export type FcmSendResult =
  | { ok: true; sentCount: number; invalidTokens: string[] }
  | { ok: false; sentCount: number; invalidTokens: string[]; error: string };

/** Sends one push to up to 500 tokens (FCM's own multicast limit) — caller chunks larger lists. */
export async function sendFcmMulticast(
  tokens: string[],
  title: string,
  body: string
): Promise<FcmSendResult> {
  if (tokens.length === 0) return { ok: true, sentCount: 0, invalidTokens: [] };
  const fbApp = getFirebaseApp();
  if (!fbApp) {
    return { ok: false, sentCount: 0, invalidTokens: [], error: "Firebase not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)" };
  }

  try {
    const res = await getMessaging(fbApp).sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: { priority: "high", notification: { channelId: "smf_default" } },
    });

    // Prune only tokens FCM says are permanently dead — never touched
    // for a transient failure (rate limit, timeout, etc.), same
    // conservative spirit as the LINE channel just surfacing an error
    // string rather than mutating unrelated state on failure.
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          invalidTokens.push(tokens[i]);
        }
      }
    });

    return { ok: true, sentCount: res.successCount, invalidTokens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, sentCount: 0, invalidTokens: [], error: msg };
  }
}
