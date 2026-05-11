import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clay: {
          DEFAULT: "oklch(58% 0.115 38)",
          deep: "oklch(46% 0.13 36)",
          soft: "oklch(72% 0.07 40)",
          tint: "oklch(92% 0.025 50)",
        },
        sage: {
          DEFAULT: "oklch(76% 0.045 145)",
          deep: "oklch(40% 0.06 145)",
          soft: "oklch(88% 0.03 145)",
        },
        cream: {
          DEFAULT: "oklch(97% 0.008 75)",
          warm: "oklch(94% 0.012 70)",
          deep: "oklch(91% 0.014 65)",
        },
        ink: {
          DEFAULT: "oklch(20% 0.008 40)",
          soft: "oklch(35% 0.008 40)",
        },
        ash: {
          DEFAULT: "oklch(58% 0.008 40)",
          line: "oklch(82% 0.008 40)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
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
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
      transitionDuration: {
        250: "250ms",
        350: "350ms",
        450: "450ms",
      },
    },
  },
  plugins: [],
};

export default config;
