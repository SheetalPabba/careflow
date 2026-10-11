import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CareFlow · Hospital patient flow",
  icons: { icon: "/favicon.svg" },
  description:
    "A calmer journey from check-in to care. Educational hospital queue management prototype.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
