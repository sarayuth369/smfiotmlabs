import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SMF IoT by M Labs — Smart Farm Internet of Things",
  description:
    "SMF IoT ระบบเกษตรอัจฉริยะครบวงจร ใช้ ESP32 + Cloud + Mobile App เพื่อเพิ่มผลผลิต ลดต้นทุน และควบคุมฟาร์มได้จากทุกที่",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
