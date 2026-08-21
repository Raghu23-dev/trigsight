import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Raghuram P — AI infrastructure";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#08090c",
          padding: "80px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: "#788092",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontFamily: "monospace",
          }}
        >
          Raghuram P
        </div>
        <div
          style={{
            fontSize: 68,
            color: "#e8eaf0",
            lineHeight: 1.1,
            marginTop: 28,
            maxWidth: 900,
          }}
        >
          I build the AI tools other engineers build with.
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 56 }}>
          {[
            ["34/34", "claims bound to source"],
            ["110 KB", "initial JavaScript"],
            ["100", "Lighthouse, mobile"],
          ].map(([v, l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, color: "#4da3ff", fontFamily: "monospace" }}>{v}</div>
              <div style={{ fontSize: 17, color: "#788092", marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
