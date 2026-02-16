import { redirect } from "next/navigation";

// Standalone settings page removed — functionality lives in the hub tabs
export default function SettingsRedirect() {
  redirect("/admin/reps?tab=settings");
}
