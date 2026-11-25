/**
 * The assistant's response stream is plain text with progress lines ("Looking up your cars…") wrapped in the ASCII record
 * separator. The server writes them only before the answer starts; the page shows the latest one while waiting and never
 * keeps them in the answer.
 */
export const STATUS_MARK = "\u001e";

export const statusLine = (text: string): string => `${STATUS_MARK}${text.replaceAll(STATUS_MARK, "")}${STATUS_MARK}`;

export function splitStatus(raw: string): { text: string; status: string } {
  const parts = raw.split(STATUS_MARK);
  // Even parts are answer text, odd parts are status lines; an unclosed status line is still arriving and is not shown.
  const text = parts.filter((_, i) => i % 2 === 0).join("");
  const lastClosed = parts.length % 2 === 1 ? parts.length - 2 : parts.length - 3;
  return { text, status: lastClosed > 0 ? parts[lastClosed] : "" };
}
