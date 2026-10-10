import { onRequest as favicon } from "../functions/favicon.png.js";
import { onRequest as appleTouchIcon } from "../functions/apple-touch-icon.png.js";
import { onRequest as ogImage } from "../functions/og-image.jpg.js";

const IMAGES = {
  "/favicon.png": favicon,
  "/apple-touch-icon.png": appleTouchIcon,
  "/og-image.jpg": ogImage,
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const image = IMAGES[path];
    if (image) return image();
    return env.ASSETS.fetch(request);
  },
};
