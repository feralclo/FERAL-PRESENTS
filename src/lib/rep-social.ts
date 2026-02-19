/**
 * Open social profile in native app (iOS deep link) with web fallback.
 * Does not navigate away from the portal.
 */
export function openSocialProfile(platform: "instagram" | "tiktok", username: string) {
  const schemes: Record<string, string> = {
    instagram: `instagram://user?username=${username}`,
    tiktok: `snssdk1233://user/profile/${username}`,
  };
  const webUrls: Record<string, string> = {
    instagram: `https://instagram.com/${username}`,
    tiktok: `https://tiktok.com/@${username}`,
  };

  // Try native app scheme
  window.location.href = schemes[platform];

  // If we're still here after 1.5s, the app didn't open — use web fallback
  const timer = setTimeout(() => {
    window.open(webUrls[platform], "_blank", "noopener");
  }, 1500);

  // If the native app opened, the page becomes hidden — cancel fallback
  const onVisibility = () => {
    if (document.hidden) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  // Clean up listener after fallback fires
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
  }, 2000);
}
