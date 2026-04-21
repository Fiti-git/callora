import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        callora: {
          red: "#DC0014",
          redDark: "#b8000f",
          black: "#0D0D0D",
          grey: "#F5F5F5",
          body: "#444444",
        },
      },
    },
  },
};

export default config;
