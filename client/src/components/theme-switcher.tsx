"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themes = [
  { key: "system", icon: Monitor, label: "System" },
  { key: "light", icon: Sun, label: "Light" },
  { key: "dark", icon: Moon, label: "Dark" },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center bg-muted rounded-lg p-1 relative">
        <div className="flex">
          {themes.map((themeOption) => {
            const Icon = themeOption.icon;
            return (
              <button
                key={themeOption.key}
                className="relative z-10 flex items-center justify-center w-8 h-8 text-muted-foreground transition-colors duration-200"
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">{themeOption.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const currentThemeIndex = themes.findIndex(t => t.key === theme) || 0;

  return (
    <div className="flex items-center bg-muted rounded-lg p-1 relative">
      <div
        className="absolute top-1 bottom-1 bg-background rounded-md shadow-sm transition-transform duration-300 ease-out z-0"
        style={{
          width: '32px',
          transform: `translateX(${currentThemeIndex * 32}px)`,
        }}
      />
      <div className="flex">
        {themes.map((themeOption) => {
          const Icon = themeOption.icon;
          const isActive = theme === themeOption.key;

          return (
            <button
              key={themeOption.key}
              onClick={() => setTheme(themeOption.key)}
              className={`relative z-10 flex items-center justify-center w-8 h-8 transition-colors duration-200 ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{themeOption.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}