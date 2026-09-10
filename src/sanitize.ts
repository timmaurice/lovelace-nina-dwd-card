/**
 * Minimal, dependency-free HTML sanitizer for untrusted feed content.
 *
 * Content rendered by this card comes from remote sources (feeds, integrations,
 * REST/template sensors) and is injected into the Home Assistant frontend
 * origin, where it would otherwise have access to the user's session. Every
 * string that ends up in `unsafeHTML()` or `.innerHTML` must pass through
 * `sanitizeHtml()` first.
 *
 * The sanitizer works on an allow-list: unknown tags are unwrapped (their text
 * is kept), dangerous tags are dropped with their subtree, and only a small set
 * of attributes survives. Event handlers (`on*`), `style`, and non-HTTP(S) URLs
 * are always removed.
 */

/** Tags that are kept, with their attributes filtered. */
const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** Tags that are removed together with everything inside them. */
const DROPPED_TAGS = new Set([
  'applet',
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'slot',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'video',
]);

/** Attributes allowed per tag; `*` applies to every allowed tag. */
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  '*': new Set(['title', 'dir', 'lang']),
  a: new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start']),
};

const URL_ATTRIBUTES = new Set(['href', 'src']);
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i;

/**
 * Checks whether a URL is safe to put into an `href`/`src` attribute.
 *
 * Rejects `javascript:`, `data:` (except base64 images, and only when
 * `allowImageData` is set), `vbscript:` and anything else that is not a plain
 * web or contact link. Relative URLs are resolved against the current document.
 *
 * @param url The URL to check.
 * @param allowImageData Whether `data:image/...;base64,` URLs are acceptable.
 * @returns True if the URL may be rendered.
 */
export function isSafeUrl(url: string | undefined | null, allowImageData = false): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (allowImageData && SAFE_IMAGE_DATA_URL.test(trimmed)) return true;

  try {
    // A base is required so that relative URLs ("/foo", "img.png") stay valid.
    const parsed = new URL(trimmed, document.baseURI);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Removes every attribute from an element that is not explicitly allowed.
 *
 * @param element The element to clean up in place.
 */
function sanitizeAttributes(element: Element): void {
  const tag = element.tagName.toLowerCase();
  const allowed = ALLOWED_ATTRIBUTES[tag];
  const global = ALLOWED_ATTRIBUTES['*'];

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const isAllowed = allowed?.has(name) || global.has(name);

    if (!isAllowed) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value, tag === 'img')) {
      element.removeAttribute(attribute.name);
    }
  }

  // Links always open in a new tab without handing the opener to the target.
  if (tag === 'a' && element.hasAttribute('href')) {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }

  // An image whose source was rejected would render as a broken icon.
  if (tag === 'img' && !element.hasAttribute('src')) {
    element.remove();
  }
}

/**
 * Walks a parsed subtree and applies the allow-list to every node.
 *
 * @param root The node whose children are sanitized in place.
 */
function sanitizeNode(root: Node): void {
  for (const child of [...root.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      // Comments, CDATA and processing instructions carry no content we want.
      child.parentNode?.removeChild(child);
      continue;
    }

    const element = child as Element;
    const tag = element.tagName.toLowerCase();

    if (DROPPED_TAGS.has(tag)) {
      element.remove();
      continue;
    }

    sanitizeNode(element);

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown but harmless wrapper: keep the text, drop the element.
      element.replaceWith(...element.childNodes);
      continue;
    }

    sanitizeAttributes(element);
  }
}

/**
 * Sanitizes untrusted HTML so it can safely be rendered into the card.
 *
 * Also repairs markup that was cut mid-tag (e.g. by length truncation), because
 * the string is re-serialized from a parsed document.
 *
 * @param html The untrusted HTML string.
 * @returns HTML containing only allow-listed tags and attributes.
 */
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';

  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  sanitizeNode(parsed.body);
  return parsed.body.innerHTML;
}
