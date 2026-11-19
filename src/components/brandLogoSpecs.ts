import type { BrandLogoId } from "@/types/orion";

export interface BrandLogoSpec {
  id: BrandLogoId;
  name: string;
  pillarFocus: string;
  description: string;
}

export const BRAND_LOGOS: BrandLogoSpec[] = [
  {
    id: "nexo",
    name: "Nexo Constelação",
    pillarFocus: "Conectividade · Inteligência",
    description:
      "Três nós interconectados em órbita ascendente, simbolizando contas, agenda e mercado em rede sincronizada.",
  },
  {
    id: "apice",
    name: "Ápice Monólito",
    pillarFocus: "Independência · Maturidade",
    description:
      "Estrutura arquitetônica vertical em equilíbrio próprio, expressando solidez patrimonial e autonomia de decisão.",
  },
  {
    id: "prisma",
    name: "Prisma Analítico",
    pillarFocus: "Inteligência · Precisão",
    description:
      "Facetas geométricas convergindo para um núcleo dourado, traduzindo clareza analítica e leitura exata de números.",
  },
  {
    id: "vortice",
    name: "Vórtice Cinético",
    pillarFocus: "Agilidade · Conectividade",
    description:
      "Asas duplas em movimento contínuo e leve, projetadas para decisões rápidas e operação fluida.",
  },
  {
    id: "orbita",
    name: "Escudo Órbita",
    pillarFocus: "Maturidade · Independência",
    description:
      "Anel protetor aberto com estrela-guia central, unindo segurança em nuvem e sofisticação executiva.",
  },
];
