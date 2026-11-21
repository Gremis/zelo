import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sindicondo",
    short_name: "Sindicondo",
    description: "Gestão de condomínios e ocorrências.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f766e",
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
