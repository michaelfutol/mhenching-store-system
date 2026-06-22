import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        "surface-container-highest": "#e0e3e5",
        "on-tertiary-container": "#fffbff",
        "surface-variant": "#e0e3e5",
        "secondary-fixed": "#6bff8f",
        "primary-fixed-dim": "#adc6ff",
        "on-tertiary-fixed-variant": "#653e00",
        "inverse-primary": "#adc6ff",
        "on-secondary-fixed-variant": "#005321",
        "error": "#ba1a1a",
        "tertiary-container": "#a36700",
        "inverse-surface": "#2d3133",
        "on-tertiary": "#ffffff",
        "on-primary-fixed-variant": "#004395",
        "tertiary-fixed-dim": "#ffb95f",
        "surface": "#f7f9fb",
        "on-secondary-fixed": "#002109",
        "surface-dim": "#d8dadc",
        "on-surface": "#191c1e",
        "on-primary-container": "#fefcff",
        "on-error": "#ffffff",
        "outline-variant": "#c2c6d6",
        "on-error-container": "#93000a",
        "secondary": "#006e2f",
        "surface-container-low": "#f2f4f6",
        "tertiary-fixed": "#ffddb8",
        "on-secondary-container": "#007432",
        "on-secondary": "#ffffff",
        "outline": "#727785",
        "on-tertiary-fixed": "#2a1700",
        "error-container": "#ffdad6",
        "on-surface-variant": "#424754",
        "on-background": "#191c1e",
        "on-primary": "#ffffff",
        "primary-fixed": "#d8e2ff",
        "secondary-container": "#6bff8f",
        "surface-tint": "#005ac2",
        "surface-bright": "#f7f9fb",
        "inverse-on-surface": "#eff1f3",
        "surface-container-lowest": "#ffffff",
        "primary": "#0058be",
        "secondary-fixed-dim": "#4ae176",
        "primary-container": "#2170e4",
        "tertiary": "#825100",
        "surface-container-high": "#e6e8ea",
        "surface-container": "#eceef0",
        "on-primary-fixed": "#001a42"
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "full": "9999px"
      },
      spacing: {
        "margin-desktop": "32px",
        "touch-target-min": "44px",
        "stack-sm": "8px",
        "margin-mobile": "16px",
        "stack-lg": "24px",
        "stack-md": "16px",
        "gutter": "16px"
      },
      fontFamily: {
        "body-md": "var(--font-inter)",
        "headline-lg": "var(--font-inter)",
        "label-md": "var(--font-inter)",
        "headline-lg-mobile": "var(--font-inter)",
        "body-lg": "var(--font-inter)",
        "display-price": "var(--font-inter)",
        "label-xl": "var(--font-inter)",
        "mono-data": "var(--font-jetbrains-mono)",
        "sans": "var(--font-inter)"
      },
      fontSize: {
        "body-md": "16px",
        "headline-lg": "24px",
        "label-md": "14px",
        "headline-lg-mobile": "20px",
        "body-lg": "18px",
        "display-price": "40px",
        "label-xl": "16px",
        "mono-data": "14px"
      },
      fontWeight: {
        "body-md": "400",
        "headline-lg": "600",
        "label-md": "500",
        "headline-lg-mobile": "600",
        "body-lg": "500",
        "display-price": "700",
        "label-xl": "600",
        "mono-data": "500"
      },
      lineHeight: {
        "body-md": "24px",
        "headline-lg": "32px",
        "label-md": "18px",
        "headline-lg-mobile": "28px",
        "body-lg": "26px",
        "display-price": "48px",
        "label-xl": "20px",
        "mono-data": "20px"
      },
      letterSpacing: {
        "display-price": "-0.02em",
        "label-xl": "0.01em"
      }
    },
  },
  plugins: [],
};
export default config;
