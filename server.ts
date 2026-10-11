import express from "express";
import compression from "compression";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

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

  // API Routes
  app.post("/api/gemini/generateContent", async (req, res) => {
    const startTime = Date.now();
    const { model, contents, config } = req.body;
    const targetModel = model || "gemini-3.7-flash";

    console.log(`[AI-SERVER] 📥 Adviesverzoek ontvangen voor model: ${targetModel}`);

    try {
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
