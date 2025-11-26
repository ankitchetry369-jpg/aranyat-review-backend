import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const SHOPIFY_STORE = "smnf7g-bg"; 
const SHOPIFY_ADMIN_VERSION = "2024-01";
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

async function shopifyRequest(path, options = {}) {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_ADMIN_VERSION}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
  });

  if (!res.ok) throw new Error("Shopify API Error " + res.status);

  return res.json();
}

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

    const newReview = {
      name,
      email,
      rating,
      title,
      text,
      verified: true,
      date: new Date().toISOString().slice(0,10),
      photo: photo || "",
      video: video || ""
    };

    let metafield;
    try {
      const result = await shopifyRequest(
        `/products/${productId}/metafields.json?namespace=aranyat&key=reviews`,
        { method: "GET" }
      );
      metafield = result.metafields && result.metafields[0];
    } catch {}

    let reviewsArray = [];
    if (metafield && metafield.value) {
      try { reviewsArray = JSON.parse(metafield.value); } catch {}
    }

    reviewsArray.unshift(newReview);

    const metafieldPayload = {
      metafield: {
        namespace: "aranyat",
        key: "reviews",
        type: "json",
        value: JSON.stringify(reviewsArray),
        owner_resource: "product",
        owner_id: Number(productId)
      }
    };

    let saved;
    if (metafield && metafield.id) {
      saved = await shopifyRequest(`/metafields/${metafield.id}.json`, {
        method: "PUT",
        body: JSON.stringify(metafieldPayload)
      });
    } else {
      saved = await shopifyRequest(`/metafields.json`, {
        method: "POST",
        body: JSON.stringify(metafieldPayload)
      });
    }

    return res.json({ success: true, review: newReview });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running");
});
