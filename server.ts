import express from "express";
import compression from "compression";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { fetchForecast } from "./src/services/weatherService";
import { CATALOG_BY_SLUG } from "./src/data/spotCatalog";
import { renderSpotPage, renderIndexPage, renderNotFoundPage } from "./src/seo/spotPage";
import type { ForecastData } from "./src/types";

// De verwachting komt binnen als lokale tijd (Europe/Amsterdam). De spotpagina's
// rekenen "nu", "vandaag" en de beste momenten op dezelfde tijd als de app.
process.env.TZ = process.env.TZ || "Europe/Amsterdam";


// ── Claude (Anthropic) als AI-motor ─────────────────────────────────────────
// Staat ANTHROPIC_API_KEY in de serveromgeving, dan gaan alle AI-verzoeken naar Claude.
// De app stuurt nog het Gemini-formaat ({ model, contents, config }); dat zetten we om.
// Zonder Anthropic-sleutel blijft Gemini (GEMINI_API_KEY) de motor.
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const CLAUDE_LIGHT_MODEL = process.env.ANTHROPIC_LIGHT_MODEL || "claude-haiku-5-5";

function toClaudeContent(contents: any): any[] {
  const out: any[] = [];
  const add = (c: any) => {
    if (c == null) return;
    if (typeof c === "string") { out.push({ type: "text", text: c }); return; }
    if (Array.isArray(c)) { c.forEach(add); return; }
    if (Array.isArray(c.parts)) { c.parts.forEach(add); return; }
    if (c.inlineData?.data) {
      out.push({ type: "image", source: { type: "base64", media_type: c.inlineData.mimeType || "image/jpeg", data: c.inlineData.data } });
      return;
    }
    if (typeof c.text === "string") out.push({ type: "text", text: c.text });
  };
  add(contents);
  return out;
}

async function claudeGenerate(contents: any, opts: { light?: boolean; json?: boolean; temperature?: number } = {}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY as string;
  const content = toClaudeContent(contents);
  if (opts.json) content.push({ type: "text", text: "Antwoord uitsluitend met één geldig JSON-object, zonder uitleg of codeblok." });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.light ? CLAUDE_LIGHT_MODEL : CLAUDE_MODEL,
      max_tokens: 2000,
      ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
      messages: [{ role: "user", content }],
    }),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude: ${data?.error?.message || `HTTP ${r.status}`}`);
  const text = (data?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  if (!opts.json) return text;
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse large JSON bodies (e.g. base64 images)
  app.use(express.json({ limit: "50mb" }));

  // Hero-foto via het eigen domein: scheelt op mobiel een extra verbinding naar
  // Unsplash (LCP). Eén keer opgehaald, in het geheugen bewaard; faalt het ophalen,
  // dan sturen we de browser door naar Unsplash zelf.
  const HERO_SRC = (w: number) =>
    `https://images.unsplash.com/photo-1502680390469-be75c86b636f?fit=crop&fm=webp&w=${w}&q=65`;
  const heroCache = new Map<number, { buf: Buffer; type: string }>();
  const loadHero = async (w: number) => {
    const hit = heroCache.get(w);
    if (hit) return hit;
    const r = await fetch(HERO_SRC(w));
    if (!r.ok) throw new Error(`hero ${w}: HTTP ${r.status}`);
    const entry = { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/webp" };
    heroCache.set(w, entry);
    return entry;
  };
  [640, 960, 1600].forEach((w) => loadHero(w).catch(() => {})); // voorverwarmen
  app.get(/^\/img\/hero-v1-(640|960|1600)\.webp$/, async (req, res) => {
    const w = Number(req.params[0]);
    try {
      const { buf, type } = await loadHero(w);
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(buf);
    } catch {
      res.redirect(302, HERO_SRC(w));
    }
  });

  // Vindbare spotpagina's (/surfverwachting/...): server-side HTML zodat Google de
  // verwachting per spot kan lezen. Verwachting per spot 1 uur in het geheugen;
  // daarna wordt de oude nog getoond terwijl op de achtergrond ververst wordt.
  const FC_TTL_MS = 60 * 60 * 1000;
  const fcCache = new Map<string, { at: number; data: ForecastData[] }>();
  const fcPending = new Map<string, Promise<ForecastData[]>>();
  const loadSpotForecast = (slug: string): Promise<ForecastData[]> => {
    const running = fcPending.get(slug);
    if (running) return running;
    const spot = CATALOG_BY_SLUG.get(slug)!;
    const p = fetchForecast(spot)
      .then((data) => { fcCache.set(slug, { at: Date.now(), data }); return data; })
      .finally(() => fcPending.delete(slug));
    fcPending.set(slug, p);
    return p;
  };
  const spotForecast = async (slug: string): Promise<{ data: ForecastData[] | null; at?: number }> => {
    const hit = fcCache.get(slug);
    if (hit) {
      if (Date.now() - hit.at > FC_TTL_MS) loadSpotForecast(slug).catch(() => {});
      return hit;
    }
    try {
      const data = await Promise.race([
        loadSpotForecast(slug),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
      ]);
      return { data, at: Date.now() };
    } catch (e: any) {
      console.warn(`[SPOTPAGINA] Verwachting ${slug} niet geladen:`, e?.message || e);
      return { data: null };
    }
  };
  const sendHtml = (res: express.Response, status: number, html: string, maxAge: number) => {
    res.status(status);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
    res.send(html);
  };
  // Express negeert standaard de slash aan het eind; daarom zelf naar de vorm
  // met slash doorsturen (één canonieke URL per pagina).
  app.get(/^\/surfverwachting\/?$/, (req, res) => {
    if (!req.path.endsWith("/")) return res.redirect(301, "/surfverwachting/");
    sendHtml(res, 200, renderIndexPage(), 3600);
  });
  app.get(/^\/surfverwachting\/([a-z0-9-]+)\/?$/, async (req, res) => {
    const slug = req.params[0];
    if (!req.path.endsWith("/")) return res.redirect(301, `/surfverwachting/${slug}/`);
    const spot = CATALOG_BY_SLUG.get(slug);
    if (!spot) return sendHtml(res, 404, renderNotFoundPage(), 300);
    const { data, at } = await spotForecast(spot.slug);
    const html = renderSpotPage(spot, data, new Date(), at ? new Date(at) : undefined);
    sendHtml(res, 200, html, data ? 900 : 60);
  });

  // API Routes
  app.post("/api/gemini/generateContent", async (req, res) => {
    const startTime = Date.now();
    const { model, contents, config } = req.body;
    const targetModel = model || "gemini-3.7-flash";

    console.log(`[AI-SERVER] 📥 Adviesverzoek ontvangen voor model: ${targetModel}`);

    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const light = /lite/i.test(String(model || ""));
        const text = await claudeGenerate(contents, { light, json: config?.responseMimeType === "application/json", temperature: config?.temperature });
        console.log(`[AI-SERVER] ✅ Claude (${light ? CLAUDE_LIGHT_MODEL : CLAUDE_MODEL}) in ${Date.now() - startTime}ms`);
        return res.json({ text });
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn(`[AI-SERVER] ⚠️ GEMINI_API_KEY ontbreekt in server environment.`);
        return res.status(503).json({ 
          error: "GEMINI_API_KEY is niet geconfigureerd in de serveromgeving." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({ 
        model: targetModel, 
        contents, 
        config 
      });

      const durationMs = Date.now() - startTime;
      console.log(`[AI-SERVER] ✅ Advies succesvol gegenereerd via ${targetModel} in ${durationMs}ms`);
      res.json({ text: response.text });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[AI-SERVER] ❌ Fout bij aanroepen ${targetModel} na ${durationMs}ms:`, error?.message || error);
      res.status(500).json({ error: error?.message || "Fout bij verwerken Gemini verzoek" });
    }
  });

  app.post("/api/moderate-image", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "No image provided" });
      }

      if (process.env.ANTHROPIC_API_KEY) {
        const m = String(base64Image).match(/^data:([^;]+);base64,(.+)$/);
        const text = await claudeGenerate([
          { inlineData: { data: m ? m[2] : base64Image, mimeType: m ? m[1] : "image/jpeg" } },
          { text: "You are a content moderator for a surfing community. Check this image. Does it contain any inappropriate, explicit, offensive, or non-safe-for-work (NSFW) content? Also, is it completely unrelated to surfing, the beach, or the sea? Reply ONLY with a JSON object: { \"isSafe\": true/false, \"reason\": \"string\" }" },
        ], { light: true, json: true, temperature: 0.1 });
        return res.json(JSON.parse(text));
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Safe fallback if moderation API key is missing
        return res.json({ isSafe: true, reason: "Moderatie overgeslagen (geen API sleutel)" });
      }

      const ai = new GoogleGenAI({ apiKey });

      // Format expected by Gemini: just the raw base64 data, without data URL prefix
      let base64Data = base64Image;
      let mimeType = "image/jpeg";
      
      const match = base64Image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
            {
              text: "You are a content moderator for a surfing community. Check this image. Does it contain any inappropriate, explicit, offensive, or non-safe-for-work (NSFW) content? Also, is it completely unrelated to surfing, the beach, or the sea? Reply ONLY with a JSON object: { \"isSafe\": true/false, \"reason\": \"string\" }"
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });

      const resultText = response.text || "{}";
      const resultJson = JSON.parse(resultText);

      res.json(resultJson);
    } catch (error: any) {
      console.error("Image Moderation Error:", error);
      res.status(500).json({ error: error?.message || "Fout bij beeldmoderatie" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Basis-beveiligingsheaders (geen CSP/X-Frame-Options: die breken Firebase-login
    // en de AI Studio-preview). COOP met popups toegestaan voor Google-login.
    app.use((_req, res, next) => {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      next();
    });
    // Gzip voor HTML/JS/CSS/JSON (de JS-bundel is ~2 MB onbewerkt).
    app.use(compression());
    // Cache: gehashte bestanden in /assets mogen een jaar mee, index.html altijd
    // opnieuw controleren, overige publieke bestanden een dag.
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }));
    // Niet-bestaande bestanden (bijv. /.well-known/ai-catalog.json, *.txt, *.json):
    // echte 404 i.p.v. index.html. Anders lezen crawlers en Lighthouse de HTML als
    // een kapotte llms.txt of een ongeldige ai-catalog.json.
    app.get(/^\/(\.well-known\/.*|.*\.[A-Za-z0-9]{1,8})$/, (_req, res) => {
      res.status(404).type("text/plain").send("Not found");
    });
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
