import { redirect } from "next/navigation";

// Standalone quests page removed — functionality lives in the hub tabs
export default function QuestsRedirect() {
  redirect("/admin/reps?tab=quests");
}
