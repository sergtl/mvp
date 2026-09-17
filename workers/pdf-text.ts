import { PDFParse } from "pdf-parse";

async function main() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

  const parser = new PDFParse({
    data: new Uint8Array(Buffer.concat(chunks)),
    verbosity: 0,
  });

  try {
    const info = await parser.getInfo();

    if (info.total > 30) throw new Error("pdf_limit");

    const result = await parser.getText();
    const text = result.pages
      .map((page) => page.text)
      .join("\n\n")
      .replace(/\u0000/g, "")
      .trim();

    if (text.length > 100_000) throw new Error("pdf_limit");
    if (text.replace(/\s/g, "").length < 40) throw new Error("needs_ocr");

    process.stdout.write(JSON.stringify({ text }));
  } catch (error) {
    const code =
      error instanceof Error &&
      ["pdf_limit", "needs_ocr"].includes(error.message)
        ? error.message
        : "invalid_pdf";

    process.stdout.write(JSON.stringify({ error: code }));
  } finally {
    await parser.destroy();
  }
}
main().catch(() => {
  process.stdout.write(JSON.stringify({ error: "invalid_pdf" }));
  process.exitCode = 1;
});
