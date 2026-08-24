import { redirect } from "next/navigation";

// This route used to be a standalone "flash firmware" page that sent the
// unpatched base firmware.bin — no ProvisioningSlot patch, no per-device
// credentials — a device flashed here would end up with placeholder
// values (SMF-BASE0) and never connect. That was a real production
// incident risk (dead board -> panic -> flash here -> still won't work).
//
// The only correct patched flash flow now lives on the MQTT tab: it
// regenerates a credential AND renders the Web USB flasher with the
// freshly patched firmware in the very same screen, so the password
// can never go stale between "generate" and "flash". Redirect here
// instead of duplicating that logic.
export default async function FlashPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  redirect(`/dashboard/devices/${deviceId}/mqtt`);
}
