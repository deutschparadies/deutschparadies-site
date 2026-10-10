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
    return env.ASSETS.fetch(request);
  },
};
