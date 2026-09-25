// Extract plain text from a PDF buffer using unpdf (serverless-friendly).
// Wrapped in a timeout — corrupt PDFs can stall pdf.js indefinitely.
export async function extractPdfText(buf: ArrayBuffer, timeoutMs = 20_000): Promise<string> {
  const work = async (): Promise<string> => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdf, { mergePages: true });
    const text: unknown = result.text;
    if (typeof text === "string") return text;
    if (Array.isArray(text)) return (text as string[]).join("\n");
    return String(text ?? "");
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("PDF extraction timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Chunk text into ~800-char windows on paragraph/sentence boundaries. */
export function chunkText(text: string, target = 800): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paragraphs) {
    if ((cur + " " + p).trim().length <= target) {
      cur = (cur ? cur + " " : "") + p;
    } else {
      if (cur) chunks.push(cur.trim());
      if (p.length <= target) {
        cur = p;
      } else {
        // hard-split very long paragraphs
        for (let i = 0; i < p.length; i += target) {
          chunks.push(p.slice(i, i + target).trim());
        }
        cur = "";
      }
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter((c) => c.length > 40).slice(0, 60);
}
