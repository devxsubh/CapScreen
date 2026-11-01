import { Cloud, Cpu, HardDrive } from "lucide-react";

/**
 * Official marks, served from public/: providers/ for AI providers, brands/ for model makers, operating systems and
 * chip makers. Sources: Simple Icons, Wikimedia Commons (public domain / CC0 / MIT files) or the company's own site.
 */
const PROVIDER_LOGOS: Record<string, string> = {
    anthropic: "/providers/anthropic.svg",
    openai: "/providers/openai.svg",
    gemini: "/providers/gemini.svg",
    groq: "/providers/groq.svg",
    openrouter: "/providers/openrouter.png",
    ollama: "/providers/ollama.svg",
    lmstudio: "/providers/lmstudio.png",
    llamacpp: "/providers/llamacpp.png",
};

/** Who made a model, recognised from its id (vendor prefixes like `meta-llama/` and `models/` are ignored). */
const MODEL_MAKERS: Array<{ match: RegExp; name: string; logo: string }> = [
    { match: /^claude/, name: "Anthropic", logo: "/providers/anthropic.svg" },
    { match: /^(gpt|o\d|chatgpt|codex)/, name: "OpenAI", logo: "/providers/openai.svg" },
    { match: /^gemini/, name: "Google", logo: "/providers/gemini.svg" },
    { match: /^gemma/, name: "Google", logo: "/brands/google.svg" },
    { match: /^(llama|codellama)/, name: "Meta", logo: "/brands/meta.svg" },
    { match: /^(qwen|qwq)/, name: "Qwen", logo: "/brands/qwen.svg" },
    { match: /^(mistral|mixtral|ministral|codestral|magistral|devstral)/, name: "Mistral AI", logo: "/brands/mistral.svg" },
    { match: /^deepseek/, name: "DeepSeek", logo: "/brands/deepseek.svg" },
    { match: /^phi/, name: "Microsoft", logo: "/brands/microsoft.svg" },
    { match: /^nomic/, name: "Nomic", logo: "/brands/nomic.png" },
    { match: /^mxbai/, name: "Mixedbread", logo: "/brands/mixedbread.png" },
];

export function modelMaker(model: string): { name: string; logo: string } | null {
    const base = (model.replace(/^models\//, "").split("/").pop() ?? model).toLowerCase();
    return MODEL_MAKERS.find((m) => m.match.test(base)) ?? null;
}

/** Operating system and chip maker for the "This computer" card. */
export function systemBrands(platform: string, cpu: string) {
    const os =
        platform === "darwin"
            ? { name: "macOS", logo: "/brands/apple.svg" }
            : platform === "win32"
              ? { name: "Windows", logo: "/brands/windows.svg" }
              : platform === "linux"
                ? { name: "Linux", logo: "/brands/linux.svg" }
                : null;
    const chip = /apple/i.test(cpu)
        ? { name: "Apple silicon", logo: "/brands/apple.svg" }
        : /intel/i.test(cpu)
          ? { name: "Intel", logo: "/brands/intel.svg" }
          : /amd|ryzen|epyc/i.test(cpu)
            ? { name: "AMD", logo: "/brands/amd.svg" }
            : /snapdragon|qualcomm/i.test(cpu)
              ? { name: "Qualcomm", logo: "/brands/qualcomm.svg" }
              : null;
    return { os, chip };
}

function Mark({ src, size }: { src: string; size: number }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static logo
        <img src={src} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    );
}

function Tile({ size, children }: { size: number; children: React.ReactNode }) {
    const box = size + 12;
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white"
            style={{ width: box, height: box }}
        >
            {children}
        </span>
    );
}

/** A provider's logo; custom endpoints fall back to a cloud or computer icon. `tile` puts it on a small white card. */
export function ProviderLogo({
    id,
    local = false,
    size = 16,
    tile = false,
}: {
    id: string;
    local?: boolean;
    size?: number;
    tile?: boolean;
}) {
    const src = PROVIDER_LOGOS[id];
    const Fallback = local ? HardDrive : Cloud;
    const mark = src ? (
        <Mark src={src} size={size} />
    ) : (
        <Fallback className="shrink-0 text-gray-400" style={{ width: size * 0.85, height: size * 0.85 }} />
    );
    return tile ? <Tile size={size}>{mark}</Tile> : mark;
}

/** The logo of the company that made a model; falls back to the provider's logo, then a chip icon. */
export function ModelLogo({
    model,
    provider,
    local = false,
    size = 16,
    tile = false,
}: {
    model: string;
    provider?: string;
    local?: boolean;
    size?: number;
    tile?: boolean;
}) {
    const maker = modelMaker(model);
    if (!maker && provider) return <ProviderLogo id={provider} local={local} size={size} tile={tile} />;
    const mark = maker ? (
        <Mark src={maker.logo} size={size} />
    ) : (
        <Cpu className="shrink-0 text-gray-400" style={{ width: size * 0.85, height: size * 0.85 }} />
    );
    return tile ? <Tile size={size}>{mark}</Tile> : mark;
}

/** A brand mark by path (used for operating systems and chip makers). */
export function BrandMark({ src, size = 16 }: { src: string; size?: number }) {
    return <Mark src={src} size={size} />;
}
