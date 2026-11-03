export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem("mdmaster:" + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem("mdmaster:" + key, JSON.stringify(value));
  } catch {
    /* 忽略配额错误 */
  }
}

export function loadString(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem("mdmaster:" + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveString(key: string, value: string): void {
  try {
    window.localStorage.setItem("mdmaster:" + key, value);
  } catch {
    /* 忽略 */
  }
}
