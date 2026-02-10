import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "FERAL PRESENTS — Underground Techno & Rave Events UK",
  description:
    "FERAL PRESENTS is an underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences across the UK and Europe.",
  openGraph: {
    type: "website",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music. Raw, unfiltered experiences.",
    images: [{ url: "https://feralpresents.com/images/banner-1.jpg" }],
    url: "https://feralpresents.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "FERAL PRESENTS — Underground Techno & Rave Events",
    description:
      "Underground events collective pushing the boundaries of techno, rave and electronic music.",
    images: ["https://feralpresents.com/images/banner-1.jpg"],
  },
  keywords: [
    "techno events",
    "rave",
    "underground music",
    "electronic music",
    "UK events",
    "warehouse rave",
    "hard techno",
    "industrial techno",
  ],
};

export default function HomePage() {
  return <LandingPage />;
}
