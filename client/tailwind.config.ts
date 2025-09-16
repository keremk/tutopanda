import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx,md,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
        border: "hsl(var(--color-border) / <alpha-value>)",
        input: "hsl(var(--color-input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--color-card) / <alpha-value>)",
          foreground: "hsl(var(--color-card-foreground) / <alpha-value>)",
          border: "hsl(var(--color-card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--color-popover) / <alpha-value>)",
          foreground: "hsl(var(--color-popover-foreground) / <alpha-value>)",
          border: "hsl(var(--color-popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--color-primary) / <alpha-value>)",
          foreground: "hsl(var(--color-primary-foreground) / <alpha-value>)",
          border: "var(--color-primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--color-secondary) / <alpha-value>)",
          foreground: "hsl(var(--color-secondary-foreground) / <alpha-value>)",
          border: "var(--color-secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--color-muted) / <alpha-value>)",
          foreground: "hsl(var(--color-muted-foreground) / <alpha-value>)",
          border: "var(--color-muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--color-accent) / <alpha-value>)",
          foreground: "hsl(var(--color-accent-foreground) / <alpha-value>)",
          border: "var(--color-accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--color-destructive) / <alpha-value>)",
          foreground: "hsl(var(--color-destructive-foreground) / <alpha-value>)",
          border: "var(--color-destructive-border)",
        },
        ring: "hsl(var(--color-ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--color-chart-1) / <alpha-value>)",
          "2": "hsl(var(--color-chart-2) / <alpha-value>)",
          "3": "hsl(var(--color-chart-3) / <alpha-value>)",
          "4": "hsl(var(--color-chart-4) / <alpha-value>)",
          "5": "hsl(var(--color-chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--color-sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--color-sidebar) / <alpha-value>)",
          foreground: "hsl(var(--color-sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--color-sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--color-sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--color-sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--color-sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--color-sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--color-sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--color-sidebar-accent-border)",
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
        mono: "var(--font-mono)",
      },
      animation: {
        "accordion-down": "var(--animate-accordion-down)",
        "accordion-up": "var(--animate-accordion-up)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
} satisfies Config;