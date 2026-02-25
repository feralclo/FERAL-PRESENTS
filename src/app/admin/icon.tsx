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
          borderRadius: 8,
          background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          E
        </span>
      </div>
    ),
    { ...size }
  );
}
