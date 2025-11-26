import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// 👇 yahi tumhara store subdomain hai (admin URL me jo smnf7g-bg dikh raha tha)
const SHOPIFY_STORE = "smnf7g-bg";
const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

app.use(express.json());

// CORS: theme se call allow
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Helper: Shopify REST Admin API call
async function shopifyRequest(path, options = {}) {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Shopify error", res.status, text);
    throw new Error(`Shopify API error ${res.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// POST /reviews : yahin se Shopify theme hit karega
app.post("/reviews", async (req, res) => {
  try {
    const {
      productId,
      name,
      email,
      rating,
      title,
      text,
      verified,
      photo,
      video
    } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "productId required" });
    }

    const newReview = {
      name,
      email,
      rating,
      title,
      text,
      verified: !!verified,
      date: new Date().toISOString().slice(0, 10),
      photo: photo || "",
      video: video || ""
    };

    // 👉 NEW namespace + key (purane se clash nahi hoga)
    const NS = "aranyat_custom";
    const KEY = "reviews_json";

    // 1) Existing metafield read karo
    const result = await shopifyRequest(
      `/products/${productId}/metafields.json?namespace=${NS}&key=${KEY}`,
      { method: "GET" }
    );

    const metafields = (result && result.metafields) || [];
    const existing = metafields[0];

    let reviewsArray = [];
    if (existing && existing.value) {
      try {
        const parsed = JSON.parse(existing.value);
        if (Array.isArray(parsed)) reviewsArray = parsed;
      } catch (e) {
        console.error("Could not parse existing reviews JSON", e);
      }
    }

    // naya review sabse upar daal do
    reviewsArray.unshift(newReview);

    if (existing && existing.id) {
      // existing record par sirf value update karo
      await shopifyRequest(`/metafields/${existing.id}.json`, {
        method: "PUT",
        body: JSON.stringify({
          metafield: {
            id: existing.id,
            value: JSON.stringify(reviewsArray),
            type: existing.type || "json"
          }
        })
      });
    } else {
      // naya metafield create karo
      await shopifyRequest(`/metafields.json`, {
        method: "POST",
        body: JSON.stringify({
          metafield: {
            namespace: NS,
            key: KEY,
            type: "json",
            value: JSON.stringify(reviewsArray),
            owner_resource: "product",
            owner_id: Number(productId)
          }
        })
      });
    }

    return res.json({ success: true, review: newReview });
  } catch (err) {
    console.error("API /reviews error", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Aranyat reviews API running on port ${PORT}`);
});
