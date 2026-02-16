import { redirect } from "next/navigation";

// Standalone rewards page removed — functionality lives in the hub tabs
export default function RewardsRedirect() {
  redirect("/admin/reps?tab=rewards");
}
