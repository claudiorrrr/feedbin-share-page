import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const FETCH_TIMEOUT_MS = 15_000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type Extracted = { content: string; author: string | null };

// Fetches the page and pulls the article out with Readability.
// Used when Feedbin's own extractor refuses a site.
export async function extractPage(url: string): Promise<Extracted | null> {
  const res = await fetch(url, {
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    return null;
  }

  const { document } = parseHTML(await res.text());

  // Readability turns relative links and image paths into absolute ones
  // using the document URL.
  Object.defineProperty(document, "documentURI", { value: url });
  Object.defineProperty(document, "baseURI", { value: url });

  const article = new Readability(document).parse();
  if (!article?.content) {
    return null;
  }

  return { content: article.content, author: article.byline ?? null };
}
