import type { Metadata } from "next";
import { LiverpoolEventPage } from "@/components/event/LiverpoolEventPage";
import { KompassEventPage } from "@/components/event/KompassEventPage";

/** Pre-render known event pages at build time for instant navigation */
export function generateStaticParams() {
  return [
    { slug: "liverpool-27-march" },
    { slug: "kompass-klub-7-march" },
  ];
}

// Event metadata by slug
const EVENT_META: Record<
  string,
  { title: string; description: string; image: string; url: string }
> = {
  "liverpool-27-march": {
    title:
      "FERAL Liverpool — Invisible Wind Factory | 27 March 2026 | Techno Rave",
    description:
      "FERAL takes over Invisible Wind Factory Liverpool on 27 March 2026. Hard techno, industrial and hardstyle. Full 360° setup with immersive production. Tickets on sale now.",
    image: "https://feralpresents.com/images/liverpool-tile.jpg",
    url: "https://feralpresents.com/event/liverpool-27-march/",
  },
  "kompass-klub-7-march": {
    title: "FERAL — Kompass Klub, Ghent | 7 March 2026",
    description:
      "FERAL takes over Kompass Klub in Ghent on 7 March 2026. 11PM — 7AM. Get tickets now.",
    image: "https://feralpresents.com/images/kompass-event-banner.jpg",
    url: "https://feralpresents.com/event/kompass-klub-7-march/",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = EVENT_META[slug];

  if (!meta) {
    return { title: "FERAL PRESENTS — Event" };
  }

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      images: [{ url: meta.image }],
      url: meta.url,
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
    keywords: [
      "techno events",
      "rave",
      "FERAL",
      "tickets",
      slug.includes("liverpool")
        ? "Liverpool rave"
        : "Kompass Klub",
    ],
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (slug === "kompass-klub-7-march") {
    return <KompassEventPage />;
  }

  // Default: Liverpool-style event page with ticket widget
  return <LiverpoolEventPage slug={slug} />;
}
