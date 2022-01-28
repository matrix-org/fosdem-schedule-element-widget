const DEFAULT_THEME = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';

interface Location {
  search: string;
}

const tryLocalStorageAccess = <R>(f: () => R): R | null => {
  try {
    return f();
  } catch (e) {
    if (e instanceof DOMException) {
      // localStorage access is disallowed, or it is full.
      return null;
    }
    throw e;
  }
};

const getLocalStorageItem = (key: string): string | null => {
  return tryLocalStorageAccess(() => window.localStorage.getItem(key));
};

const setLocalStorageItem = (key: string, value: string) => {
  tryLocalStorageAccess(() => window.localStorage.setItem(key, value));
};

export const getTheme = (location: Location = window.location) => {
  const urlParams = new URLSearchParams(location.search);
  const theme = urlParams.get('theme');
  const widgetId = urlParams.get('widgetId') || '';
  const currentTheme = theme || getLocalStorageItem(`${widgetId}_theme`) || DEFAULT_THEME;
  setLocalStorageItem(`${widgetId}_theme`, currentTheme);
  return currentTheme;
};
export const switchTheme = (location: Location = window.location) => {
  const urlParams = new URLSearchParams(location.search);
  const widgetId = urlParams.get('widgetId') || '';
  const theme = urlParams.get('theme') || getLocalStorageItem(`${widgetId}_theme`) || DEFAULT_THEME;
  if (theme === 'light') {
    urlParams.set('theme', 'dark');
  } else {
    urlParams.set('theme', 'light');
  }
  return urlParams.toString();
};
