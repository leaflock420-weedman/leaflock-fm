import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #020503 0%, #0b2f1d 55%, #000000 100%)",
          color: "#c7f35c",
          fontSize: 180,
          fontWeight: 900,
          letterSpacing: "-0.08em"
        }}
      >
        LL
      </div>
    ),
    { ...size }
  );
}