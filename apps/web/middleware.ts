import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 检查用户是否有有效的 session cookie
 *
 * Better Auth 使用 cookie 存储 session token。
 * 在 middleware 中我们只检查 cookie 是否存在，
 * 详细的 session 验证在 API 路由中进行。
 */
function hasSessionCookie(request: NextRequest): boolean {
  // Better Auth 的 session cookie 名称
  // 在 HTTPS 环境下使用 __Secure- 前缀
  const sessionCookie =
    request.cookies.get("__Secure-better-auth.session_token") ||
    request.cookies.get("better-auth.session_token");
  return !!sessionCookie?.value;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public routes (不需要认证)
  // /p/* 是发布页 —— 必须允许匿名访问，否则「分享给别人看」根本不成立。
  // 可见性（public / unlisted / private）和撤回状态由用例层判断，
  // 不在 middleware 里做 —— middleware 只看 cookie，看不到 Publication。
  // /account/ 是账号删除的申请回执页和撤销页。它们**必须**公开：
  // 申请删除的同一个事务里 session 就被全部撤销了，此后这个人无法登录
  // （ADR-007）。要求登录的话，令牌永远显示不出来，撤销也永远走不通。
  const publicRoutes = [
    "/login",
    "/register",
    "/chichibu",
    "/forgot-password",
    "/p/",
    "/account/restore",
    "/account/deletion-requested",
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Auth-only routes (已登录用户不应访问，如登录/注册页)
  const authOnlyRoutes = ["/login", "/register", "/forgot-password"];
  const isAuthOnlyRoute = authOnlyRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // API routes (有自己的认证逻辑)
  // Better Auth 路由由 [...all] 处理
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 检查是否有 session cookie
  const hasSession = hasSessionCookie(request);

  // 如果没有 session cookie
  if (!hasSession) {
    // 如果访问受保护的路由，重定向到登录
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // 访问公开路由，允许通过
    return NextResponse.next();
  }

  // 有 session cookie
  // 如果访问登录/注册页面，重定向到文档列表
  if (isAuthOnlyRoute) {
    return NextResponse.redirect(new URL("/documents", request.url));
  }

  // 其他页面正常访问
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (uploaded images)
     */
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image.png|images).*)",
  ],
};
