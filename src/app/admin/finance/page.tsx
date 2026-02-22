import { redirect } from "next/navigation";

export default function FinanceRedirect() {
  redirect("/admin/settings/finance/");
}
