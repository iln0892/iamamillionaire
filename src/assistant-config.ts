export const assistantModels = [
  {
    id: "Qwen3.5-4B-q4f16_1-MLC",
    label: "Standard · Qwen3.5 4B",
    download: "etwa 2,4 GB",
    memory: "etwa 4 GB Grafikspeicher",
  },
  {
    id: "Qwen3.5-2B-q4f16_1-MLC",
    label: "Kompakt · Qwen3.5 2B",
    download: "etwa 1,1 GB",
    memory: "etwa 2,3 GB Grafikspeicher",
  },
] as const;
export type AssistantModel = (typeof assistantModels)[number]["id"];
