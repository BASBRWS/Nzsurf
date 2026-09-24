import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse large JSON bodies (e.g. base64 images)
  app.use(express.json({ limit: "50mb" }));

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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
