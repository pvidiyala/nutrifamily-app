export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, mode } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    // mode = "parse" (natural language) or "ingredient" (single ingredient + quantity)
    const prompt = mode === "ingredient"
      ? `You are a nutrition expert. Calculate accurate nutritional values for: "${text}".
This may be an Indian ingredient or food item.
Return ONLY valid JSON, no markdown:
{
  "name": "ingredient name",
  "quantity": "exact quantity with unit",
  "nutrients": {
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
  }
}`
      : `You are a nutrition expert. Parse this recipe description and calculate nutrition for every ingredient.
Recipe: "${text}"

Rules:
- Identify every ingredient and its quantity
- If quantity is vague (pinch, little, dash) use a realistic small amount
- Calculate nutrition accurately for each ingredient at the stated quantity
- Include Indian foods/spices accurately
- Sum all ingredients for the total

Return ONLY valid JSON, no markdown:
{
  "recipeName": "suggested name for this dish",
  "servings": 1,
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": "amount with unit",
      "nutrients": {
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
      }
    }
  ],
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
  }
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text2 = data.content?.[0]?.text || "";
    const result = JSON.parse(text2.replace(/```json|```/g, "").trim());
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
