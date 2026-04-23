export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return res.status(500).json({ error: "Unsplash key not configured" });

  try {
    // Search for food image
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + " food")}&per_page=1&orientation=landscape&client_id=${accessKey}`;
    const data = await (await fetch(url)).json();
    const photo = data.results?.[0];

    if (!photo) return res.status(404).json({ image: null });

    return res.status(200).json({
      image: photo.urls?.small || null,
      thumb: photo.urls?.thumb || null,
      credit: photo.user?.name || "",
      creditLink: photo.user?.links?.html || "",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
