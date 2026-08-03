/**
 * Studio 的最小外壳
 *
 * 刻意朴素。Phase 2A 的验收标准是**用户能不能看见那条链**，
 * 不是页面好不好看 —— 只有 `<form>` 和 `<ul>` 也算成立。
 * 反过来，样式做得再精致，看不见「我的理解改变过」这件事，就仍然算失败。
 *
 * 设计接手之后，替换的应该只有这个文件和各页面的 className，
 * 数据流一行都不用动。
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-900">
      <nav className="mb-8 flex gap-4 border-b border-neutral-200 pb-3 text-sm">
        <Link href="/studio" className="font-medium hover:underline">
          旅程
        </Link>
        <Link href="/studio/moments" className="hover:underline">
          全部 Moment
        </Link>
        <Link href="/studio/works" className="hover:underline">
          作品
        </Link>
        <Link href="/studio/account" className="ml-auto hover:underline" data-testid="nav-account">
          账号
        </Link>
      </nav>
      {children}
    </div>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="mb-1 text-2xl font-semibold">{children}</h1>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">{children}</h2>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

/**
 * 错误和提示都从 URL 参数来。
 *
 * 用 searchParams 而不是客户端状态，是为了让「没有 JavaScript 也能用」
 * 这件事成立 —— 从而证明链路本身不依赖前端框架。
 */
export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  const isError = Boolean(error);
  return (
    <div
      role="status"
      data-testid={isError ? 'error-banner' : 'notice-banner'}
      className={
        isError
          ? 'mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800'
          : 'mb-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
      }
    >
      {error ?? notice}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="mb-3 rounded border border-neutral-200 p-4">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none';

export const buttonClass =
  'rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50';

export const linkButtonClass =
  'rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50';

/**
 * 时间显示。
 *
 * 直接切 ISO 字符串，不做时区转换 —— 时区是个真问题（用户在旅行，
 * 拍摄地时区和居住地时区经常不同），但**不在 Phase 2A 的范围内**。
 * 假装用 toLocaleString 处理过，只会让这个未决问题被藏起来。
 * 见 PHASE-2-SCHEMA-CONTRACT.md「第一版不做」。
 */
export function fmtDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : '—';
}

export function fmtDateTime(iso?: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '—';
}
