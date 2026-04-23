export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "base64 and mimeType required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            {
              type: "text",
              text: `You are a nutrition expert. Analyze this food image carefully. Identify all visible foods including Indian dishes, snacks, and ingredients. Estimate nutritional content for the total visible portion.

Return ONLY valid JSON, no markdown, no explanation:
{
  "foods": ["food name 1", "food name 2"],
  "totalNutrients": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "fiber": number,
    "vitaminC": number,
    "vitaminD": number,
    "calcium": number,
    "iron": number,
    "sodium": number,
    "b12": number,
    "magnesium": number,
    "potassium": number,
    "omega3": number
  },
  "confidence": "high|medium|low",
  "servingNote": "brief description of estimated portion size"
}`,
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
