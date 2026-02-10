import { KLAVIYO_LIST_ID, KLAVIYO_COMPANY_ID } from "./constants";

/**
 * Subscribe an email to the Klaviyo list.
 * Matches the existing POST to manage.kmail-lists.com.
 */
export async function subscribeToKlaviyo(
  email: string,
  listId: string = KLAVIYO_LIST_ID
): Promise<{ success: boolean; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append("g", listId);
    formData.append("email", email);
    formData.append("$fields", "");

    const res = await fetch(
      "https://manage.kmail-lists.com/ajax/subscriptions/subscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Identify user in Klaviyo SDK (client-side only).
 * Pushes to window._learnq if the Klaviyo SDK is loaded.
 */
export function identifyInKlaviyo(email: string) {
  if (typeof window === "undefined") return;

  const learnq = (window as unknown as Record<string, unknown>)._learnq as Array<unknown[]> | undefined;
  if (learnq) {
    learnq.push(["identify", { $email: email }]);
  }
}
