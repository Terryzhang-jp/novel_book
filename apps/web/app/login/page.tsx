"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import DomeGallery from "@/components/dome-gallery/DomeGallery";
import { MapPin, Loader2, Mail, Lock, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { PhotoCategory } from "@/types/storage";

interface PublicPhotoIndex {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileUrl: string;
  thumbnailUrl?: string; // 缩略图 (300x300)
  category: PhotoCategory;
  dateTime?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: string;
}

// Google 官方彩色图标
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("w-5 h-5", className)}>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default function LoginPage() {
  const [loginMethod, setLoginMethod] = useState<"google" | "email">("google");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [photos, setPhotos] = useState<PublicPhotoIndex[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const router = useRouter();

  /**
   * Fetch all public photos for the map
   */
  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        setPhotosLoading(true);
        const response = await fetch("/api/public/photos");

        if (response.ok) {
          const data = await response.json();
          setPhotos(data.photos);
        }
      } catch (error) {
        console.error("Error fetching photos:", error);
      } finally {
        setPhotosLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  /**
   * Email/Password 登录
   */
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "邮箱或密码错误");
      } else {
        // 检查是否需要修改密码
        const user = result.data?.user as any;
        if (user?.requirePasswordChange) {
          router.push("/change-password");
        } else {
          router.push("/documents");
        }
        router.refresh();
      }
    } catch (err) {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Google OAuth 登录
   */
  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/documents",
      });
    } catch (err) {
      setError("Google 登录失败，请稍后重试");
      setGoogleLoading(false);
    }
  };

  if (photosLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading Travel Creation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 左侧展示区 - 3D 照片球 (桌面端显示) */}
      <div className="hidden md:flex md:flex-1 h-full relative">
        {photos.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
            <div className="text-center">
              <MapPin className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-400">探索旅途中的精彩瞬间</p>
            </div>
          </div>
        ) : (
          <>
            <DomeGallery
              images={photos.map((p) => ({
                src: p.thumbnailUrl || p.fileUrl, // 优先使用缩略图
                alt: p.userName || "",
              }))}
              radius={350}
              imageSize={120}
            />
            {/* 统计叠加层 */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* 顶部品牌区 */}
              <div className="absolute top-8 left-8 right-8">
                <p className="text-white/60 text-sm tracking-widest uppercase">
                  Travel Creation
                </p>
              </div>
              {/* 底部统计 */}
              <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between text-white/90">
                <div>
                  <p className="text-3xl font-bold">{photos.length}</p>
                  <p className="text-sm opacity-80">照片已分享</p>
                </div>
                <div className="h-10 w-px bg-white/30" />
                <div>
                  <p className="text-3xl font-bold">
                    {new Set(photos.map((p) => p.userId)).size}
                  </p>
                  <p className="text-sm opacity-80">旅行者</p>
                </div>
                <div className="h-10 w-px bg-white/30" />
                <div>
                  <p className="text-3xl font-bold">
                    {photos.filter((p) => p.location).length}
                  </p>
                  <p className="text-sm opacity-80">足迹地点</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 右侧登录区 */}
      <div className="w-full md:w-[480px] bg-card shadow-2xl flex flex-col">
        {/* 品牌标题 */}
        <div className="pt-12 md:pt-16 px-6 md:px-12 text-center">
          <h1
            className="text-4xl md:text-5xl tracking-widest text-foreground"
            style={{
              fontFamily:
                '"Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", "STSong", "SimSun", "PingFang SC", "Microsoft YaHei", serif',
              letterSpacing: "0.15em",
              fontWeight: 400,
            }}
          >
            Travel Creation
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            记录旅途，分享精彩
          </p>
        </div>

        {/* 登录内容区 */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-12 py-8">
          <div className="w-full max-w-sm mx-auto space-y-6">
            {/* 欢迎语 */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                欢迎回来
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                选择登录方式，开始你的旅程
              </p>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-border">
              <button
                onClick={() => {
                  setLoginMethod("google");
                  setError("");
                }}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-all duration-300",
                  "border-b-2 -mb-[1px] flex items-center justify-center gap-2",
                  loginMethod === "google"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <GoogleIcon className="w-4 h-4" />
                Google 登录
              </button>
              <button
                onClick={() => {
                  setLoginMethod("email");
                  setError("");
                }}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-all duration-300",
                  "border-b-2 -mb-[1px] flex items-center justify-center gap-2",
                  loginMethod === "email"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Mail className="w-4 h-4" />
                邮箱登录
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive animate-in slide-in-from-top-2 duration-200">
                {error}
              </div>
            )}

            {/* 登录内容 */}
            <div className="min-h-[280px]">
              {loginMethod === "google" ? (
                /* Google 登录面板 */
                <div className="space-y-6 py-4">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                      <GoogleIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">
                        使用 Google 账号快速登录
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        安全、快捷，无需记住密码
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    className={cn(
                      "w-full flex items-center justify-center gap-3",
                      "h-12 px-6 rounded-lg",
                      "bg-white border border-gray-300 dark:border-gray-600",
                      "text-gray-700 dark:text-gray-200 font-medium",
                      "hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md",
                      "focus:outline-none focus:ring-2 focus:ring-primary/20",
                      "transition-all duration-200",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {googleLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <GoogleIcon />
                    )}
                    <span>
                      {googleLoading ? "正在跳转..." : "Continue with Google"}
                    </span>
                  </button>

                  <p className="text-xs text-center text-muted-foreground">
                    点击登录即表示同意我们的服务条款和隐私政策
                  </p>
                </div>
              ) : (
                /* 邮箱登录表单 */
                <form onSubmit={handleEmailLogin} className="space-y-5 py-4">
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        邮箱地址
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="block w-full appearance-none rounded-lg border border-border bg-background pl-10 pr-4 py-3 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm transition-all"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        密码
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full appearance-none rounded-lg border border-border bg-background pl-10 pr-4 py-3 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-lg text-sm font-semibold"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        登录中...
                      </>
                    ) : (
                      "登 录"
                    )}
                  </Button>
                </form>
              )}
            </div>

            {/* 底部链接 */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="text-center text-sm text-muted-foreground">
                还没有账号？{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  立即注册
                </Link>
              </div>

              <div className="flex items-center justify-center gap-4 text-sm">
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  忘记密码？
                </Link>
                <span className="text-border">|</span>
                <Link
                  href="/chichibu"
                  className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  无需登录，继续浏览
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>
  );
}
