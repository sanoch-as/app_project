/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Anchored on Jira Cloud's blue (#0c66e4 = 600 / #0055cc = 700) so every
        // existing text-brand-*/bg-brand-* usage retints automatically.
        brand: {
          50: "#eef6ff",
          100: "#e9f2ff",
          200: "#c6e0ff",
          300: "#94c6ff",
          400: "#5aa7ff",
          500: "#2684ff",
          600: "#0c66e4",
          700: "#0055cc",
          800: "#0747a6",
          900: "#08386b",
        },
        jira: {
          purple: "#8270db",
          text: "#172b4d",
          textSub: "#626f86",
          border: "#dcdfe4",
          borderSoft: "#eef0f2",
          panel: "#fafbfc",
          hover: "#f1f2f4",
          orange: "#e56910",
          red: "#e2483d",
          projectRed: "#de350b",
          blueBadgeBg: "#e9f2ff",
          blueBadgeText: "#0c66e4",
          greenBadgeBg: "#dcfff1",
          greenBadgeText: "#216e4e",
          grayBadgeBg: "#f1f2f4",
          grayBadgeText: "#44546f",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        "jira-sm": "0 1px 2px rgba(9, 30, 66, 0.08)",
        "jira-md": "0 4px 8px -2px rgba(9, 30, 66, 0.14), 0 0 1px rgba(9, 30, 66, 0.31)",
      },
    },
  },
  plugins: [],
};
