"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/tailwind/ui/button";
import { PhotoMap, type PhotoLocation } from "@/components/maps/photo-map";
import { LocationPhotosModal } from "@/components/photos/location-photos-modal";
import { MapPin, Loader2 } from "lucide-react";
import type { PhotoCategory } from "@/types/storage";

interface PublicPhotoIndex {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileUrl: string;
  category: PhotoCategory;
  dateTime?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: string;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<PublicPhotoIndex[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<PhotoLocation | null>(null);
  const router = useRouter();

  /**
   * Fetch all public photos for the map
   */
  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        setPhotosLoading(true);
        const response = await fetch('/api/public/photos');

        if (response.ok) {
          const data = await response.json();
          setPhotos(data.photos);
        }
      } catch (error) {
        console.error('Error fetching photos:', error);
      } finally {
        setPhotosLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // 检查是否需要修改密码
        if (data.requirePasswordChange) {
          router.push("/change-password");
        } else {
          router.push("/documents");
        }
        router.refresh();
      } else {
        setError(data.error || "Invalid email or password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationClick = (location: PhotoLocation) => {
    setSelectedLocation(location);
  };

  // Get representative userId for PhotoMap component
  const representativeUserId = photos.length > 0 ? photos[0].userId : '';

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
      {/* Left Side - Interactive Map (hidden on mobile) */}
      <div className="hidden md:flex flex-1 relative">
        {photos.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center bg-muted">
            <div className="text-center">
              <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No photos yet</p>
            </div>
          </div>
        ) : (
          <PhotoMap
            photos={photos}
            userId={representativeUserId}
            onLocationClick={handleLocationClick}
            height="100vh"
            initialZoom={10}
          />
        )}
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full md:w-[480px] bg-card shadow-2xl flex flex-col">
        <div className="pt-16 text-center">
          <h1 className="text-5xl tracking-widest text-foreground" style={{
            fontFamily: '"Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", "STSong", "SimSun", "PingFang SC", "Microsoft YaHei", serif',
            letterSpacing: '0.15em',
            fontWeight: 400,
          }}>
            9月 秩父 之行
          </h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 md:p-12">
          <div className="w-full max-w-sm space-y-8">
            {/* Header */}
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Welcome Back
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to share your travel stories
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full appearance-none rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full appearance-none rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-3 text-sm font-semibold"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            {/* Footer Links */}
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary hover:text-primary/80"
                >
                  Sign up
                </Link>
              </div>

              <div className="text-center">
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="text-center">
                <Link
                  href="/chichibu"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Continue exploring without login →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Footer */}
        <div className="border-t border-border px-8 md:px-12 py-6 bg-muted/50">
          <div className="flex items-center justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">{photos.length}</p>
              <p className="text-xs text-muted-foreground">Photos Shared</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-2xl font-bold text-foreground">
                {new Set(photos.map(p => p.userId)).size}
              </p>
              <p className="text-xs text-muted-foreground">Travelers</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div>
              <p className="text-2xl font-bold text-foreground">
                {photos.filter(p => p.location).length}
              </p>
              <p className="text-xs text-muted-foreground">Locations</p>
            </div>
          </div>
        </div>
      </div>

      {/* Location Photos Modal */}
      <LocationPhotosModal
        isOpen={!!selectedLocation}
        location={selectedLocation}
        onClose={() => setSelectedLocation(null)}
      />
    </div>
  );
}
