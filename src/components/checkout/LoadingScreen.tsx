"use client";

interface LoadingScreenProps {
  hidden: boolean;
  status: string;
  detail: string;
  progress: number;
}

/**
 * Full-screen loading interstitial.
 * Matches checkout/index.html lines 594-601 exactly.
 * Uses CSS classes from checkout-page.css.
 */
export function LoadingScreen({ hidden, status, detail, progress }: LoadingScreenProps) {
  return (
    <div className={`loading-screen${hidden ? " loading-screen--hidden" : ""}`} id="loadingScreen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/FERAL%20LOGO.svg"
        alt="FERAL PRESENTS"
        className="loading-screen__logo"
      />
      <div className="loading-screen__status">{status}</div>
      <div className="loading-screen__bar">
        <div
          className="loading-screen__progress"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="loading-screen__detail">{detail}</div>
    </div>
  );
}
