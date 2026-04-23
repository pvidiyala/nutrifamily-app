export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: "barcode required" });

  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const data = await (await fetch(url)).json();

    if (data.status !== 1 || !data.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const p = data.product;
    const n = p.nutriments || {};

    return res.status(200).json({
      name: p.product_name || "Unknown Product",
      brand: p.brands || "",
      image: p.image_front_url || p.image_front_small_url || null,
      per: p.serving_size ? `per ${p.serving_size}` : "per 100g",
      nutriscore: p.nutriscore_grade?.toUpperCase() || null,
      nutrients: {
        calories: Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"] || 0),
        protein: parseFloat((n.proteins_serving || n.proteins_100g || 0).toFixed(1)),
        carbs: parseFloat((n.carbohydrates_serving || n.carbohydrates_100g || 0).toFixed(1)),
        fat: parseFloat((n.fat_serving || n.fat_100g || 0).toFixed(1)),
        fiber: parseFloat((n.fiber_serving || n.fiber_100g || 0).toFixed(1)),
        sodium: Math.round((n.sodium_serving || n.sodium_100g || 0) * (n.sodium_serving ? 1 : 1000)),
        vitaminC: parseFloat((n["vitamin-c_serving"] || n["vitamin-c_100g"] || 0).toFixed(1)),
        calcium: Math.round(n.calcium_serving || n.calcium_100g || 0),
        iron: parseFloat((n.iron_serving || n.iron_100g || 0).toFixed(2)),
        vitaminD: 0, b12: 0,
        magnesium: Math.round(n.magnesium_serving || n.magnesium_100g || 0),
        potassium: Math.round(n.potassium_serving || n.potassium_100g || 0),
        omega3: 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
