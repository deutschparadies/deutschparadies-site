import { onRequest as favicon } from "../functions/favicon.png.js";
import { onRequest as appleTouchIcon } from "../functions/apple-touch-icon.png.js";
import { leadBox, contactCardInner } from "./lead-html.js";

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
    const isHome = path === "/" || path === "/index.html" || path === "/index";
    const m = path.match(/^\/cursuri\/([abc][12])-([12])(\.html)?\/?$/i);
    const course = m ? `${m[1].toUpperCase()}.${m[2]}` : "";
    const hasForm = isHome || !!course;
    let rw = new HTMLRewriter().on("head", {
      element(el) {
        // Meta Pixel (loads only after cookie consent) on every page
        el.append('<script src="/px.js" defer></script>', { html: true });
        if (hasForm) el.append('<link rel="stylesheet" href="/lead.css">', { html: true });
      },
    });
    if (isHome) {
      rw = rw
        .on("section.hero-simple", {
          element(el) {
            el.after(`<div class="lead-top">${leadBox("", "h3").replace('id="inscriere"', 'id="inscriere-sus"')}</div>`, { html: true });
          },
        })
        .on("#contact .contact-card", {
          element(el) {
            el.setAttribute("id", "inscriere");
            el.setInnerContent(contactCardInner(), { html: true });
          },
        });
    }
    if (course) {
      rw = rw.on("main", {
        element(el) {
          el.append(leadBox(course, "h2"), { html: true });
        },
      });
    }
    if (hasForm) {
      rw = rw.on("body", {
        element(el) {
          el.append('<script src="/lead.js" defer></script>', { html: true });
        },
      });
    }
    return rw.transform(res);
  },
};
