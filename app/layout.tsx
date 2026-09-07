import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "WWT CRM",
  description: "WWT's internal sales and customer relationship platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}<Toaster position="bottom-right" richColors /></body>
    </html>
  );
}
