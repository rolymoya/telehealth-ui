import { ImageResponse } from "next/og";

export const alt = "Apoth Health";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#efe5d6",
          color: "#241d19",
          display: "flex",
          flexDirection: "column",
          fontFamily: "serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "76px 84px",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "#6b8a71",
            fontFamily: "sans-serif",
            fontSize: 26,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Apoth Health
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            maxWidth: 920,
          }}
        >
          <div
            style={{
              fontSize: 82,
              lineHeight: 1.04,
            }}
          >
            Patient-facing telehealth technology.
          </div>
          <div
            style={{
              color: "#5f392b",
              fontFamily: "sans-serif",
              fontSize: 30,
              lineHeight: 1.35,
            }}
          >
            Account, intake, billing, and care-workflow access for independent clinician review.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
