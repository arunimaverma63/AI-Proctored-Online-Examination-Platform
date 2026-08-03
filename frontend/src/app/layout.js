import "./globals.css";
import { LanguageProvider } from "./components/LanguageContext";
import PWARegistration from "./components/PWARegistration";

export const metadata = {
  title: "AI Proctored Online Examination",
  description: "AI Proctored Online Examination Platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI Exam",
  },
};

export const viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PWARegistration />
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

