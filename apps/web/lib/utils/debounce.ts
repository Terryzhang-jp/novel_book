/**
 * Debounce function - 防抖函数
 * 延迟执行函数，只在最后一次调用后delay毫秒才执行
 *
 * @param func - 要防抖的函数
 * @param delay - 延迟时间(毫秒)
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  let timeoutId: NodeJS.Timeout | null = null;

  const debouncedFunc = (...args: Parameters<T>) => {
    // 清除之前的定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 设置新的定时器
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };

  // 取消函数 - 用于组件卸载时清理
  debouncedFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFunc;
}

/**
 * useDebounce hook - React Hook版本的防抖
 *
 * @example
 * const debouncedSearch = useDebounce((query: string) => {
 *   // 执行搜索
 * }, 300);
 */
export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  const debouncedFunc = debounce(callback, delay);

  // 组件卸载时清理
  if (typeof window !== 'undefined') {
    // 浏览器环境
    const cleanup = () => debouncedFunc.cancel();

    // 注意：这里只是为了提供cancel方法
    // 实际清理应该在useEffect的cleanup函数中调用
    return debouncedFunc;
  }

  return debouncedFunc;
}
