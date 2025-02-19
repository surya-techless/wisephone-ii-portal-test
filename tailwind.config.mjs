/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      container: {
        center: true,
        padding: "24px",
        maxWidth: "1000px"
      }
    }
  },
  // Change your theme at https://daisyui.com/docs/themes/.
  daisyui: {
    themes: [
      {
        mytheme: {
          primary: "#3d3953",
          secondary: "#f5f5f4",
          accent: "#6d28d9",
          neutral: "#d1d5db",
          "base-100": "#FFFFFF",
          info: "#a5f3fc",
          success: "#86efac",
          warning: "#fca5a5",
          error: "#fb7185"
        }
      }
    ]
  },
  plugins: [require("@tailwindcss/typography"), require("daisyui")],
  darkMode: "class"
};
