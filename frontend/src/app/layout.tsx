import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runspect — Algorithms Lab",
  description: "Aprenda programação competitiva com C++17, guias de estudo e visualizações passo a passo de algoritmos e estruturas de dados.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
