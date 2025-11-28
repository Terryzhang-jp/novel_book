/**
 * Profile Page - 个人主页
 *
 * 显示用户的基本信息、统计数据、照片和地点
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Camera, MapPin, FileText, Calendar, Mail, Loader2, ArrowLeft, Lock, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { PhotoGrid } from '@/components/gallery/photo-grid';
import { PhotoDetailModal } from '@/components/photos/photo-detail-modal';
import type { Photo, Location, PhotoStats } from '@/types/storage';

interface ProfileData {
  user: {
    id: string;
    email: string;
    name?: string;
    createdAt: string;
    updatedAt: string;
  };
  stats: {
    photos: PhotoStats;
    locations: number;
    documents: number;
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 并发执行所有请求，等待全部完成
      const [profileResult, photosResult, locationsResult] = await Promise.allSettled([
        fetch('/api/profile'),
        fetch('/api/photos'),
        fetch('/api/locations'),
      ]);

      // 处理 profile 请求结果
      if (profileResult.status === 'fulfilled') {
        const response = profileResult.value;
        if (!response.ok) {
          if (response.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Failed to fetch profile');
        }
        const data = await response.json();
        setProfile(data);
      } else {
        console.error('Error fetching profile:', profileResult.reason);
        setError('Failed to load profile data');
      }

      // 处理 photos 请求结果
      if (photosResult.status === 'fulfilled') {
        const response = photosResult.value;
        if (response.ok) {
          const data = await response.json();
          setPhotos(data.photos);
        }
      } else {
        console.error('Error fetching photos:', photosResult.reason);
      }

      // 处理 locations 请求结果
      if (locationsResult.status === 'fulfilled') {
        const response = locationsResult.value;
        if (response.ok) {
          const data = await response.json();
          setLocations(data.locations || []);
        }
      } else {
        console.error('Error fetching locations:', locationsResult.reason);
      }
    } catch (err) {
      console.error('Error loading profile data:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile');

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile data');
    }
  };

  const fetchPhotos = async () => {
    try {
      const response = await fetch('/api/photos');

      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      setPhotos(data.photos);
    } catch (err) {
      console.error('Error fetching photos:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/locations');

      if (!response.ok) {
        throw new Error('Failed to fetch locations');
      }

      const data = await response.json();
      setLocations(data.locations || []);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validate passwords
    if (newPassword.length < 6) {
      setPasswordError('新密码至少需要 6 个字符');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不匹配');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          force: false, // Regular password change
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setPasswordSuccess('密码修改成功！');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Clear success message after 3 seconds
        setTimeout(() => setPasswordSuccess(''), 3000);
      } else {
        setPasswordError(data.error || '密码修改失败');
      }
    } catch (err) {
      setPasswordError('发生错误，请重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">加载个人资料...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !profile) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-4">{error || '无法加载个人资料'}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Link
                href="/gallery"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回相册</span>
              </Link>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">个人主页</h1>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Hero Section - Magazine Cover Style */}
          <div className="flex flex-col items-center text-center mb-16 animate-in fade-in zoom-in duration-700">
            {/* Avatar with Glow */}
            <div className="relative mb-8 group">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 border-4 border-background shadow-2xl flex items-center justify-center relative z-10 overflow-hidden">
                <User className="w-16 h-16 text-primary/80" />
              </div>
            </div>

            {/* Name & Bio */}
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground tracking-tight mb-4">
              {profile.user.name || 'Anonymous Creator'}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground mb-8 font-light tracking-wide uppercase text-sm">
              <span>Member since {new Date(profile.user.createdAt).getFullYear()}</span>
              <span className="w-1 h-1 bg-border rounded-full" />
              <span>{profile.user.email}</span>
            </div>

            {/* Sleek Stats Row */}
            <div className="flex items-center gap-8 md:gap-16 border-y border-border/40 py-6 px-12 backdrop-blur-sm bg-card/30">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground font-serif">{profile.stats.photos.total}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Photos</p>
              </div>
              <div className="w-px h-10 bg-border/40" />
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground font-serif">{profile.stats.locations}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Locations</p>
              </div>
              <div className="w-px h-10 bg-border/40" />
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground font-serif">{profile.stats.documents}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Stories</p>
              </div>
            </div>
          </div>

          {/* Account Settings (Collapsible) */}
          <div className="max-w-2xl mx-auto mb-20">
            <details className="group bg-card/50 border border-border/50 rounded-xl overflow-hidden transition-all hover:bg-card/80">
              <summary className="flex items-center justify-between p-4 cursor-pointer list-none select-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-medium">Account Settings</span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="p-6 pt-0 border-t border-border/50 mt-4">
                <h3 className="text-sm font-medium mb-4 text-muted-foreground">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="block w-full bg-background/50 border border-border rounded-lg px-4 py-2 pr-10 text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                      placeholder="Current Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="block w-full bg-background/50 border border-border rounded-lg px-4 py-2 pr-10 text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        placeholder="New Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="block w-full bg-background/50 border border-border rounded-lg px-4 py-2 pr-10 text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        placeholder="Confirm New Password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                  {passwordSuccess && <p className="text-xs text-green-500">{passwordSuccess}</p>}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            </details>
          </div>

          {/* Content Sections */}
          <div className="space-y-20">

            {/* Issue 01: Photos */}
            <section>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 py-4 mb-8 flex items-center justify-between">
                <h2 className="text-xl font-serif font-bold tracking-tight">Issue 01: Recent Captures</h2>
                <Link href="/gallery" className="text-xs font-medium uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                  View All
                </Link>
              </div>

              {photos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                  {photos.slice(0, 8).map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square relative group overflow-hidden cursor-pointer bg-muted"
                      onClick={() => setDetailPhotoId(photo.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.fileUrl}
                        alt="User photo"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center border border-dashed border-border rounded-xl">
                  <Camera className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground font-serif italic">No photos captured yet.</p>
                  <Link href="/gallery/upload" className="text-primary text-sm mt-2 inline-block hover:underline">Start your journey</Link>
                </div>
              )}
            </section>

            {/* Issue 02: Locations */}
            <section>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 py-4 mb-8 flex items-center justify-between">
                <h2 className="text-xl font-serif font-bold tracking-tight">Issue 02: Places Visited</h2>
                <Link href="/gallery/locations" className="text-xs font-medium uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
                  Manage
                </Link>
              </div>

              {locations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {locations.slice(0, 6).map((location) => (
                    <div key={location.id} className="group relative pl-6 border-l-2 border-border/50 hover:border-primary transition-colors py-2">
                      <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-background border-2 border-border group-hover:border-primary transition-colors" />
                      <h3 className="font-serif font-bold text-lg leading-tight mb-1 group-hover:text-primary transition-colors">{location.name}</h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                        {location.coordinates.latitude.toFixed(2)}°N, {location.coordinates.longitude.toFixed(2)}°E
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <MapPin className="w-3 h-3" />
                        <span>{location.usageCount} memories here</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center border border-dashed border-border rounded-xl">
                  <MapPin className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground font-serif italic">No places marked yet.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Photo Detail Modal */}
        <PhotoDetailModal
          isOpen={!!detailPhotoId}
          photoId={detailPhotoId}
          userId={profile.user.id}
          onClose={() => setDetailPhotoId(null)}
        />
      </div>
    </AppLayout>
  );
}
