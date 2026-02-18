import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ThemeContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  darkMode: false,
  toggleDarkMode: () => {},
});

const STORAGE_KEY = 'theme';
const SWITCHING_CLASS = 'theme-switching';

function getInitialDarkMode(): boolean {
  try {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (storedTheme === 'dark') return true;
    if (storedTheme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function applyTheme(darkMode: boolean) {
  const root = document.documentElement;
  root.classList.add(SWITCHING_CLASS);
  root.classList.toggle('dark', darkMode);
  requestAnimationFrame(() => {
    root.classList.remove(SWITCHING_CLASS);
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  useLayoutEffect(() => {
    applyTheme(darkMode);
    try {
      localStorage.setItem(STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({ darkMode, toggleDarkMode }),
    [darkMode, toggleDarkMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
