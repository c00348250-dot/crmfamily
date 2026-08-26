import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#13243a",
        borderRadius: 42,
      }}
    >
      <div
        style={{
          width: 116,
          height: 116,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c9973c",
          color: "#13243a",
          borderRadius: 30,
          fontSize: 58,
          fontWeight: 900,
          letterSpacing: -4,
          fontFamily: "Arial, sans-serif",
        }}
      >
        CF
      </div>
    </div>,
    size,
  );
}
