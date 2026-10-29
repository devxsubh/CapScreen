/**
 * Human-readable model names for the UI. Model ids stay the source of truth (sent to the backend, shown as tooltips);
 * these only change what people read: `models/gemini-3.8-flash` → "Gemini 3.8 Flash", `claude-sonnet-5-5` → "Claude Sonnet 5.5".
 */

const WORDS: Record<string, string> = {
    claude: "Claude",
    gpt: "GPT",
    gemini: "Gemini",
    gemma: "Gemma",
    llama: "Llama",
    mistral: "Mistral",
    mixtral: "Mixtral",
    qwen: "Qwen",
    deepseek: "DeepSeek",
    phi: "Phi",
    grok: "Grok",
    kimi: "Kimi",
    oss: "OSS",
    mini: "mini",
    nano: "nano",
    it: "",
    latest: "",
};

/** Dated snapshots (`-20251001`, `-2024-08-06`, `-0613`) and `-latest`: the date isn't something people choose by. */
const SNAPSHOT = /-(\d{8}|\d{4}-\d{2}-\d{2}|\d{4}|latest)$/;

function word(token: string): string {
    const lower = token.toLowerCase();
    if (lower in WORDS) return WORDS[lower];
    if (/^o\d$/.test(lower)) return lower; // OpenAI's o-series stays lowercase: o3
    if (/^\d+(\.\d+)?[bm]$/i.test(token)) return token.toUpperCase(); // parameter counts: 70b → 70B
    return token.charAt(0).toUpperCase() + token.slice(1);
}

export function modelDisplayName(id: string): string {
    let name = id.replace(/^models\//, "").split("/").pop() ?? id;

    // Ollama style `llama3.2:3b`: family and size tag.
    let tag = "";
    const colon = name.indexOf(":");
    if (colon > 0) {
        tag = name.slice(colon + 1);
        name = name.slice(0, colon);
        if (tag === "latest") tag = "";
    }

    let preview = false;
    for (let prev = ""; prev !== name; ) {
        prev = name;
        name = name.replace(SNAPSHOT, "");
        if (/-preview(-\d{2}-\d{2})?$/.test(name)) {
            preview = true;
            name = name.replace(/-preview(-\d{2}-\d{2})?$/, "");
        }
        name = name.replace(/-exp(erimental)?$/, "");
    }

    const tokens = name.split("-").filter(Boolean);
    const parts: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // Claude-style versions are separate integers: opus-4-5 → 4.5.
        if (/^\d{1,2}$/.test(t)) {
            let v = t;
            while (i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i + 1])) v += `.${tokens[++i]}`;
            parts.push(v);
            continue;
        }
        // Google writes Flash-Lite with a hyphen.
        if (t.toLowerCase() === "lite" && parts[parts.length - 1] === "Flash") {
            parts[parts.length - 1] = "Flash-Lite";
            continue;
        }
        // Names glued to versions: llama3.2 → Llama 3.2, qwen2.5 → Qwen 2.5.
        const glued = t.match(/^([a-z]+)(\d+(?:\.\d+)*)$/i);
        if (glued && glued[1].toLowerCase() !== "o" && i === 0) {
            parts.push(word(glued[1]), glued[2]);
            continue;
        }
        const w = word(t);
        if (w) parts.push(w);
    }

    // OpenAI joins the family and version with a hyphen: GPT-5 mini, GPT-4o, GPT-OSS 120B.
    let label = parts.join(" ");
    label = label.replace(/^GPT (OSS|\d[\w.]*)/, "GPT-$1");

    if (preview) label += " (preview)";
    if (tag) label += ` · ${tag.split("-").map(word).filter(Boolean).join(" ")}`;
    return label || id;
}

/** One short line on what a model is for, when the family makes it clear. */
export function modelHint(id: string): string | null {
    const m = id.toLowerCase();
    if (/claude.*opus|opus/.test(m)) return "Most capable";
    if (/claude.*sonnet|sonnet/.test(m)) return "Balanced speed and quality";
    if (/claude.*haiku|haiku/.test(m)) return "Fastest";
    if (/gemini-[\d.]+-flash-lite/.test(m)) return "Fastest · free tier";
    if (/gemini-[\d.]+-flash/.test(m)) return "Fast · free tier";
    if (/gemini-[\d.]+-pro/.test(m)) return "Most capable";
    if (/^gpt-[\d.]+-nano$/.test(m)) return "Fastest";
    if (/^gpt-[\d.]+-mini$/.test(m)) return "Fast";
    if (/^gpt-[\d.]+$/.test(m)) return "Most capable";
    return null;
}

/** Provider names without the "(local)" suffix the presets carry; locality is shown separately. */
export function providerDisplayName(label: string): string {
    return label.replace(/\s*\(local\)$/i, "").replace(/ server$/i, "");
}
