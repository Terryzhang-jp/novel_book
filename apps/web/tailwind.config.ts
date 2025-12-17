import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // 主字体 - ZCOOL XiaoWei (文艺衬线)
        sans: [
          'ZCOOL XiaoWei',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        // 衬线字体 - ZCOOL XiaoWei
        serif: [
          'ZCOOL XiaoWei',
          'Georgia',
          'serif',
        ],
        // 手写/草书字体 - Liu Jian Mao Cao
        cursive: [
          'Liu Jian Mao Cao',
          'cursive',
        ],
        // 快乐字体 - ZCOOL KuaiLe (可爱风格)
        kuaile: [
          'ZCOOL KuaiLe',
          'sans-serif',
        ],
        // 小薇字体 - ZCOOL XiaoWei
        xiaowei: [
          'ZCOOL XiaoWei',
          'serif',
        ],
        // 毛草字体 - Liu Jian Mao Cao
        maocao: [
          'Liu Jian Mao Cao',
          'cursive',
        ],
        mono: [
          'JetBrainsMono',
          'Fira Code',
          'Menlo',
          'Monaco',
          'Courier New',
          'monospace',
        ],
        title: ['ZCOOL XiaoWei', 'serif'],
        default: ['ZCOOL XiaoWei', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            lineHeight: '1.8',
            'p': {
              marginTop: '1.25em',
              marginBottom: '1.25em',
            },
            'h1, h2, h3, h4': {
              fontFamily: 'Noto Serif SC, serif',
              letterSpacing: '0',
              fontWeight: '600',
            },
            'strong': {
              fontWeight: '700',
            },
            'code': {
              fontFamily: 'JetBrainsMono, monospace',
            },
            'blockquote': {
              fontStyle: 'normal',
              borderLeftColor: 'hsl(var(--primary))',
            },
          },
        },
        lg: {
          css: {
            lineHeight: '1.85',
            fontSize: '1.125rem',
          },
        },
      },
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
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;

export default config;
