import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/current";

export default async function AdminIndex() {
  const s = await getAdminSession();
  redirect(s ? "/admin/dashboard" : "/admin/login");
}
