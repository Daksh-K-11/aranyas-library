import { prepareForOcr } from "@/lib/image"

/** Free, in-browser OCR via tesseract.js. Loaded lazily on first use. */
export async function recognizeText(image: Blob, onProgress?: (p: number) => void): Promise<string> {
  const [{ createWorker }, prepared] = await Promise.all([import("tesseract.js"), prepareForOcr(image)])
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(prepared)
    return tidyOcr(data.text)
  } finally {
    await worker.terminate()
  }
}

export function tidyOcr(text: string): string {
  return text
    .replace(/-\n(?=[a-z])/g, "") // re-join hyphenated line breaks
    .replace(/([^\n])\n(?!\n)/g, "$1 ") // unwrap single line breaks
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Best guess at a title from cover OCR: the longest line of mostly letters. */
export function guessTitle(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/[^\p{L}\p{N}' :&,.!?-]/gu, "").trim())
    .filter((l) => l.length >= 2 && /\p{L}{2,}/u.test(l))
  lines.sort((a, b) => b.length - a.length)
  return lines[0] ?? ""
}
