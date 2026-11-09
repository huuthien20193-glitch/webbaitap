import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import { AuthProvider } from "@/lib/auth";
import { DataProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "StudyFlow – Smart Study Planner",
  description: "Nền tảng quản lý kế hoạch học tập, nhiệm vụ và tiến độ học tập của bạn.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Áp theme trước khi render để tránh chớp trắng ở Dark Mode
const themeScript = `(function(){try{var t=localStorage.getItem('studyflow:theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <DataProvider>{children}</DataProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
