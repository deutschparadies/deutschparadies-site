import { onRequest as favicon } from "../functions/favicon.png.js";
import { onRequest as appleTouchIcon } from "../functions/apple-touch-icon.png.js";

const IMAGES = {
  "/favicon.png": favicon,
  "/apple-touch-icon.png": appleTouchIcon,
};

// Share image for the home page (Facebook / WhatsApp preview), hosted on Cloudinary
const OG_IMAGE_URL = "https://res.cloudinary.com/huqvafro/image/upload/deutschparadies/share-home.jpg";

async function ogImage() {
  const res = await fetch(OG_IMAGE_URL);
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/og-image.jpg") return ogImage();
    const image = IMAGES[path];
    if (image) return image();
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return res;
    // Meta Pixel (loads only after cookie consent) on every page
    return new HTMLRewriter()
      .on("head", {
        element(el) {
          el.append('<script src="/px.js" defer></script>', { html: true });
        },
      })
      .transform(res);
  },
};
