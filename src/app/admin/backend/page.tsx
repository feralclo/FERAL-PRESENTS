import { redirect } from "next/navigation";

export default function BackendIndex() {
  redirect("/admin/backend/health/");
}
