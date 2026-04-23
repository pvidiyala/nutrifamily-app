// /api/ingredient.js
// Fetches nutrition for a single ingredient, scaled to given quantity
// Also handles natural language recipe parsing via AI

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // POST: parse natural language recipe
  if (req.method === "POST") {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API key not configured" });

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a nutrition expert. Parse this cooking description and extract all ingredients with quantities.
Convert all quantities to grams (use standard conversions: 1 tbsp oil=14g, 1 tbsp=15g for most, 1 tsp=5g, 1 cup=240ml/g, 1 egg=50g, pinch=0.5g).
For each ingredient, provide accurate nutrition per the specified quantity (not per 100g).
Include Indian foods if mentioned.

Recipe description: "${description}"

Return ONLY valid JSON array, no markdown:
[
  {
    "name": "ingredient name",
    "quantity": "e.g. 2 tbsp",
    "grams": number,
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
]`,
          }],
        }),
      });

      const data = await aiRes.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
      const text = data.content?.[0]?.text || "[]";
      const ingredients = JSON.parse(text.replace(/```json|```/g, "").trim());
      return res.status(200).json({ ingredients });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: search single ingredient + scale to quantity
  const { query, grams } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  const qty = parseFloat(grams) || 100;

  try {
    const results = [];

    // 1. Try USDA first (best for ingredients)
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=3&dataType=Foundation,SR%20Legacy&api_key=DEMO_KEY`;
    const usdaRes = await fetch(usdaUrl);
    const usdaData = await usdaRes.json();

    const getNutrient = (food, id) => {
      const n = food.foodNutrients?.find(fn => fn.nutrientId === id);
      return n?.value || 0;
    };

    (usdaData.foods || []).slice(0, 2).forEach(food => {
      const per100 = {
        calories:  Math.round(getNutrient(food, 1008)),
        protein:   parseFloat(getNutrient(food, 1003).toFixed(1)),
        carbs:     parseFloat(getNutrient(food, 1005).toFixed(1)),
        fat:       parseFloat(getNutrient(food, 1004).toFixed(1)),
        fiber:     parseFloat(getNutrient(food, 1079).toFixed(1)),
        sodium:    Math.round(getNutrient(food, 1093)),
        vitaminC:  parseFloat(getNutrient(food, 1162).toFixed(1)),
        calcium:   Math.round(getNutrient(food, 1087)),
        iron:      parseFloat(getNutrient(food, 1089).toFixed(2)),
        vitaminD:  Math.round(getNutrient(food, 1114)),
        b12:       parseFloat(getNutrient(food, 1178).toFixed(2)),
        magnesium: Math.round(getNutrient(food, 1090)),
        potassium: Math.round(getNutrient(food, 1092)),
        omega3:    parseFloat(getNutrient(food, 1404).toFixed(2)),
      };
      // Scale to requested quantity
      const scale = qty / 100;
      const scaled = {};
      Object.keys(per100).forEach(k => {
        scaled[k] = parseFloat((per100[k] * scale).toFixed(k === "calories" ? 0 : 1));
      });
      results.push({ source: "usda", name: food.description, per100, scaled, grams: qty });
    });

    // 2. Try Open Food Facts for packaged Indian foods
    if (results.length < 2) {
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=2&fields=product_name,nutriments`;
      const offData = await (await fetch(offUrl)).json();
      (offData.products || []).filter(p => p.product_name && p.nutriments).slice(0, 2).forEach(p => {
        const n = p.nutriments || {};
        const per100 = {
          calories:  Math.round(n["energy-kcal_100g"] || 0),
          protein:   parseFloat((n.proteins_100g || 0).toFixed(1)),
          carbs:     parseFloat((n.carbohydrates_100g || 0).toFixed(1)),
          fat:       parseFloat((n.fat_100g || 0).toFixed(1)),
          fiber:     parseFloat((n.fiber_100g || 0).toFixed(1)),
          sodium:    Math.round((n.sodium_100g || 0) * 1000),
          vitaminC:  parseFloat((n["vitamin-c_100g"] || 0).toFixed(1)),
          calcium:   Math.round(n.calcium_100g || 0),
          iron:      parseFloat((n.iron_100g || 0).toFixed(1)),
          vitaminD:  0, b12: 0,
          magnesium: Math.round(n.magnesium_100g || 0),
          potassium: Math.round(n.potassium_100g || 0),
          omega3:    0,
        };
        const scale = qty / 100;
        const scaled = {};
        Object.keys(per100).forEach(k => {
          scaled[k] = parseFloat((per100[k] * scale).toFixed(k === "calories" ? 0 : 1));
        });
        results.push({ source: "openfoodfacts", name: p.product_name, per100, scaled, grams: qty });
      });
    }

    // 3. AI fallback for Indian ingredients
    if (results.length === 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `Provide accurate nutritional data per 100g for: "${query}". This may be an Indian ingredient/food.
Return ONLY valid JSON, no markdown:
{"name":"${query}","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"vitaminC":0,"vitaminD":0,"calcium":0,"iron":0,"sodium":0,"b12":0,"magnesium":0,"potassium":0,"omega3":0}`,
            }],
          }),
        });
        const aiData = await aiRes.json();
        const text = aiData.content?.[0]?.text || "{}";
        try {
          const per100 = JSON.parse(text.replace(/```json|```/g, "").trim());
          const scale = qty / 100;
          const scaled = {};
          const keys = ["calories","protein","carbs","fat","fiber","vitaminC","vitaminD","calcium","iron","sodium","b12","magnesium","potassium","omega3"];
          keys.forEach(k => { scaled[k] = parseFloat(((per100[k]||0) * scale).toFixed(k==="calories"?0:1)); });
          const cleanPer100 = {};
          keys.forEach(k => { cleanPer100[k] = per100[k]||0; });
          results.push({ source: "ai", name: per100.name || query, per100: cleanPer100, scaled, grams: qty });
        } catch {}
      }
    }

    return res.status(200).json({ results: results.slice(0, 3) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
