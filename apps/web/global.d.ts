/**
 * Global type declarations for the application
 */

// CSS Module declarations
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

// Allow importing CSS files without content
declare module '@/styles/*.css';

/**
 * Fontsource 包只导出 CSS，没有 .d.ts。
 * 静态 `import '@fontsource/x'` 走的是 CSS loader，TS 不管；
 * 但按需加载用的是 `import('@fontsource/x')`，TS 会去找类型。
 * 这里统一声明为副作用模块。见 lib/fonts/registry.ts。
 */
declare module '@fontsource/*' {
  const css: void;
  export default css;
}
