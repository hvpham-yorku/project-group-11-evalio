import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // The Pink Sky Colors
        sky: {
          pink: "#F8BBD0",   // Clearer Pastel Pink
          purple: "#F3E5F5",
          blue: "#E1F5FE",
        },
        // We update slate-600 so the "checked" steps and text turn pink!
        slate: {
          50: "#F5F7FA",
          100: "#E1F5FE", 
          200: "#F3E5F5", 
          600: "#F06292", // Bright Pastel Pink for active steps/text
          700: "#EC407A", // Deeper pink for hover
          800: "#F8BBD0", 
        },
        // Brand also becomes pink for the circle backgrounds
        brand: {
          DEFAULT: "#F06292",
          light: "#FCE4EC",
          dark: "#D81B60",
        },
        accent: {
          light: "#FDFBF7",
          DEFAULT: "#D7C0AE",
          dark: "#967E76",
        },
      },
    },
  },
  plugins: [],
}
export default config