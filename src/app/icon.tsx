import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a12 0%, #12101f 100%)",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #7C3AED 100%)",
            borderRadius: 5,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
              letterSpacing: "-0.5px",
            }}
          >
            E
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
