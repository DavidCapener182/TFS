import type { Metadata, Viewport } from "next"
import { Montserrat } from "next/font/google"
import { ScreenZoomNormalizer } from "@/components/layout/screen-zoom-normalizer"
import "./globals.css"

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
})

export const metadata: Metadata = {
  title: "The Fragrance Shop Platform",
  description: "Internal operations platform for The Fragrance Shop.",
  applicationName: "The Fragrance Shop Platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "The Fragrance Shop Platform",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/tfs-pwa-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/tfs-pwa-icon.svg", sizes: "any", type: "image/svg+xml" }],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#232154",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={montserrat.className}>
        <ScreenZoomNormalizer />
        {children}
      </body>
    </html>
  )
}
