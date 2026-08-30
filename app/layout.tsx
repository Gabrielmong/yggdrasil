import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yggdrasil",
  description: "A reading tracking app with social elements",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
