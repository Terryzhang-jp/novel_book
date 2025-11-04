/**
 * Profile Page - 个人主页
 *
 * 显示用户的基本信息、统计数据、照片和地点
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Camera, MapPin, FileText, Calendar, Mail, Loader2, ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';
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
          {/* User Info Card */}
          <div className="bg-card rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-start gap-6">
              {/* Avatar Placeholder */}
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-12 h-12 text-primary" />
              </div>

              {/* User Details */}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {profile.user.name || '未设置昵称'}
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span>{profile.user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>加入于 {formatDate(profile.user.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Password Change Card */}
          <div className="bg-card rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">修改密码</h3>
                <p className="text-sm text-muted-foreground">保护你的账户安全</p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-foreground mb-2">
                  当前密码
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="block w-full appearance-none rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm pr-10"
                    placeholder="输入当前密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-2">
                    新密码
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="block w-full appearance-none rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm pr-10"
                      placeholder="至少 6 个字符"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-2">
                    确认新密码
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="block w-full appearance-none rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm pr-10"
                      placeholder="再次输入新密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {passwordError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  {passwordSuccess}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      修改中...
                    </>
                  ) : (
                    '修改密码'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Photos Stats */}
            <div className="bg-card rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">照片总数</p>
                  <p className="text-2xl font-bold text-foreground">{profile.stats.photos.total}</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">时间+地点</span>
                  <span className="font-medium">{profile.stats.photos.byCategory['time-location']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">仅时间</span>
                  <span className="font-medium">{profile.stats.photos.byCategory['time-only']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">仅地点</span>
                  <span className="font-medium">{profile.stats.photos.byCategory['location-only']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">无元数据</span>
                  <span className="font-medium">{profile.stats.photos.byCategory.neither}</span>
                </div>
              </div>
            </div>

            {/* Locations Stats */}
            <div className="bg-card rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">地点库</p>
                  <p className="text-2xl font-bold text-foreground">{profile.stats.locations}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                你已保存 {profile.stats.locations} 个常用地点
              </p>
            </div>

            {/* Documents Stats */}
            <div className="bg-card rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">文档</p>
                  <p className="text-2xl font-bold text-foreground">{profile.stats.documents}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                你已创建 {profile.stats.documents} 个文档
              </p>
            </div>
          </div>

          {/* Photos Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">我的照片</h2>
              <Link
                href="/gallery"
                className="text-primary hover:text-primary/80 transition-colors text-sm"
              >
                查看全部 →
              </Link>
            </div>
            {photos.length > 0 ? (
              <PhotoGrid
                photos={photos.slice(0, 12)}
                userId={profile.user.id}
                onPhotoClick={setDetailPhotoId}
              />
            ) : (
              <div className="bg-card rounded-lg shadow-md p-12 text-center">
                <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">还没有上传照片</p>
                <Link
                  href="/gallery/upload"
                  className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  上传第一张照片
                </Link>
              </div>
            )}
          </div>

          {/* Locations Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">我的地点</h2>
              <Link
                href="/gallery/locations"
                className="text-primary hover:text-primary/80 transition-colors text-sm"
              >
                管理地点 →
              </Link>
            </div>
            {locations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.slice(0, 6).map((location) => (
                  <div
                    key={location.id}
                    className="bg-card rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1 truncate">
                          {location.name}
                        </h3>
                        {location.address?.formattedAddress && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {location.address.formattedAddress}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            {location.coordinates.latitude.toFixed(4)}, {location.coordinates.longitude.toFixed(4)}
                          </span>
                          <span>使用 {location.usageCount} 次</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-lg shadow-md p-12 text-center">
                <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">还没有保存地点</p>
                <Link
                  href="/gallery/locations"
                  className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  创建第一个地点
                </Link>
              </div>
            )}
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
