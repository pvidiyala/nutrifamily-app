export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    // 1. Try Open Food Facts first
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,nutriments,image_front_small_url,nutriscore_grade`;
    const offRes = await fetch(offUrl);
    const offData = await offRes.json();
    const offProducts = (offData.products || []).filter(p => p.product_name);

    // 2. Try USDA FoodData Central (free, no key needed, great for Indian foods)
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=DEMO_KEY`;
    const usdaRes = await fetch(usdaUrl);
    const usdaData = await usdaRes.json();

    const results = [];

    // Parse OFF results
    offProducts.slice(0, 3).forEach(p => {
      const n = p.nutriments || {};
      results.push({
        source: "openfoodfacts",
        name: p.product_name,
        brand: p.brands || "",
        image: p.image_front_small_url || null,
        nutriscore: p.nutriscore_grade?.toUpperCase() || null,
        per: "100g",
        nutrients: {
          calories: Math.round(n["energy-kcal_100g"] || 0),
          protein: parseFloat((n.proteins_100g || 0).toFixed(1)),
          carbs: parseFloat((n.carbohydrates_100g || 0).toFixed(1)),
          fat: parseFloat((n.fat_100g || 0).toFixed(1)),
          fiber: parseFloat((n.fiber_100g || 0).toFixed(1)),
          sodium: Math.round((n.sodium_100g || 0) * 1000),
          vitaminC: parseFloat((n["vitamin-c_100g"] || 0).toFixed(1)),
          calcium: Math.round(n.calcium_100g || 0),
          iron: parseFloat((n.iron_100g || 0).toFixed(1)),
          vitaminD: 0, b12: 0,
          magnesium: Math.round(n.magnesium_100g || 0),
          potassium: Math.round(n.potassium_100g || 0),
          omega3: 0,
        },
      });
    });

    // Parse USDA results
    (usdaData.foods || []).slice(0, 3).forEach(food => {
      const getNutrient = (id) => {
        const n = food.foodNutrients?.find(fn => fn.nutrientId === id);
        return n?.value || 0;
      };
      results.push({
        source: "usda",
        name: food.description,
        brand: food.brandOwner || "",
        image: null,
        nutriscore: null,
        per: "100g",
        nutrients: {
          calories: Math.round(getNutrient(1008)),
          protein: parseFloat((getNutrient(1003)).toFixed(1)),
          carbs: parseFloat((getNutrient(1005)).toFixed(1)),
          fat: parseFloat((getNutrient(1004)).toFixed(1)),
          fiber: parseFloat((getNutrient(1079)).toFixed(1)),
          sodium: Math.round(getNutrient(1093)),
          vitaminC: parseFloat((getNutrient(1162)).toFixed(1)),
          calcium: Math.round(getNutrient(1087)),
          iron: parseFloat((getNutrient(1089)).toFixed(1)),
          vitaminD: Math.round(getNutrient(1114)),
          b12: parseFloat((getNutrient(1178)).toFixed(2)),
          magnesium: Math.round(getNutrient(1090)),
          potassium: Math.round(getNutrient(1092)),
          omega3: parseFloat((getNutrient(1404)).toFixed(2)),
        },
      });
    });

    // If no results from either, use AI fallback
    if (results.length === 0) {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Provide accurate nutritional information per 100g for: "${query}". This may be an Indian food. Return ONLY valid JSON array with 1 item:\n[{"name":"food name","per":"100g","nutrients":{"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"vitaminC":0,"vitaminD":0,"calcium":0,"iron":0,"sodium":0,"b12":0,"magnesium":0,"potassium":0,"omega3":0}}]`,
          }],
        }),
      });
      const aiData = await aiRes.json();
      const text = aiData.content?.[0]?.text || "[]";
      try {
        const aiResults = JSON.parse(text.replace(/```json|```/g, "").trim());
        aiResults.forEach(r => results.push({ ...r, source: "ai", image: null, brand: "", nutriscore: null }));
      } catch { }
    }

    return res.status(200).json({ results: results.slice(0, 5) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
