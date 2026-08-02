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
        // ── 正文：纯系统字体栈，零网络请求 ──────────────────────────
        // 此前 sans/serif 都以 ZCOOL XiaoWei 打头，而 body 挂了 font-xiaowei，
        // 等于整站正文都用网络字体。实测后果：中文内容较多的页面会命中
        // 9–10 个 unicode-range 子集、约 510 KB 字体流量。
        // 见 PERFORMANCE-AUDIT.md Q6 的更正说明。
        //
        // 现在正文一律用系统字体（macOS/iOS 用苹方，Windows 用微软雅黑，
        // Android 用思源黑体），品牌感通过 font-brand 保留在标题/Logo 上。
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans CJK SC',
          'Source Han Sans SC',
          'sans-serif',
        ],
        serif: [
          'Georgia',
          'Songti SC',
          'SimSun',
          'Noto Serif CJK SC',
          'Source Han Serif SC',
          'serif',
        ],
        // ── 品牌字体：只用在标题 / Logo 等少量文字上 ────────────────
        // 字符少 → 命中的 unicode 子集就少 → 下载量小。
        // 不要用在正文或长文上。
        brand: [
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
        // 中文字体
        'noto-sans-sc': ['Noto Sans SC', 'sans-serif'],
        'noto-serif-sc': ['Noto Serif SC', 'serif'],
        'ma-shan-zheng': ['Ma Shan Zheng', 'cursive'],
        // 日语字体
        'noto-sans-jp': ['Noto Sans JP', 'sans-serif'],
        'noto-serif-jp': ['Noto Serif JP', 'serif'],
        'zen-maru': ['Zen Maru Gothic', 'sans-serif'],
        // 英文字体
        'playfair': ['Playfair Display', 'serif'],
        'dancing': ['Dancing Script', 'cursive'],
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
