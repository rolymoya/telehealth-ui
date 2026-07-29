import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./patient-app/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        clay: {
          DEFAULT: "#343437",
          deep: "#171719",
          soft: "#79b8e1",
          tint: "#eef3ff",
        },
        sage: {
          DEFAULT: "#9dcc7d",
          deep: "#397057",
          soft: "#e2f1eb",
        },
        cream: {
          DEFAULT: "#f9f9fa",
          warm: "#f2f2f4",
          deep: "#ededf0",
        },
        ink: {
          DEFAULT: "#171719",
          soft: "#46474b",
        },
        ash: {
          DEFAULT: "#68696d",
          line: "#d9dade",
        },
      },
      fontFamily: {
        display: ["Arial", "Helvetica", "sans-serif"],
        sans: ["Arial", "Helvetica", "sans-serif"],
      },
      fontSize: {
        // Display scale, optical-size aware via Fraunces variable axis (font-variation-settings handled in components when needed)
        "display-xl": ["clamp(3rem, 8.5vw, 6rem)", { lineHeight: "0.98", letterSpacing: "-0.022em" }],
        "display-lg": ["clamp(2.5rem, 6vw, 4.25rem)", { lineHeight: "1.02", letterSpacing: "-0.018em" }],
        "display-md": ["clamp(2rem, 4.5vw, 3rem)", { lineHeight: "1.08", letterSpacing: "-0.012em" }],
        eyebrow: ["0.78rem", { lineHeight: "1.2", letterSpacing: "0.08em" }],
      },
      letterSpacing: {
        eyebrow: "0.08em",
      },
      maxWidth: {
        prose: "65ch",
        measure: "72ch",
        page: "82rem",
      },
      boxShadow: {
        soft: "0 12px 40px rgba(20, 24, 22, 0.08)",
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
      transitionDuration: {
        250: "250ms",
        350: "350ms",
        450: "450ms",
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        "fade-up": "fade-up 700ms ease-out both",
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
