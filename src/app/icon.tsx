import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#efe5d6",
          color: "#5f392b",
          display: "flex",
          fontFamily: "serif",
          fontSize: 42,
          fontWeight: 600,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        A
      </div>
    ),
    size,
  );
}
