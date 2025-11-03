import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "./lib/auth/jwt";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const pathname = request.nextUrl.pathname;

  // Public routes (不需要认证)
  const publicRoutes = ["/login", "/register", "/chichibu"];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Auth-only routes (已登录用户不应访问，如登录/注册页)
  const authOnlyRoutes = ["/login", "/register"];
  const isAuthOnlyRoute = authOnlyRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // API routes (有自己的认证逻辑)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 如果没有 token
  if (!token) {
    // 如果访问受保护的路由，重定向到登录
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // 访问公开路由，允许通过
    return NextResponse.next();
  }

  // 有 token，验证是否有效
  try {
    await verifyToken(token);

    // Token 有效
    // 如果访问登录/注册页面（而不是其他公开页面），重定向到文档列表
    if (isAuthOnlyRoute) {
      return NextResponse.redirect(new URL("/documents", request.url));
    }

    // 其他页面（包括 /chichibu）正常访问
    return NextResponse.next();
  } catch (error) {
    // Token 无效，删除 cookie 并重定向到登录
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("auth-token");
    return response;
  }
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
