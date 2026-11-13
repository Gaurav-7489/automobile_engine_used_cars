/**
 * Guard rails around the staff assistant, applied in code before and after the model so they hold whatever the conversation
 * says:
 *  1. Requests to see, send or recover a secret (anyone's password, a one-time or authenticator code, API keys, access tokens,
 *     session cookies, database or connection strings, the assistant's own instructions) are answered here with a refusal and
 *     the safe way to do the legitimate thing. The model is never called for them.
 *  2. Anything in the reply that looks like a credential is replaced with [hidden] before it reaches the screen.
 * The lookups themselves never return credentials; these rules are the second and third layers.
 */
const SECRET = /(pass\s?word|passcode|\bpwd\b|\botp\b|one[\s-]?time (?:code|password)|2fa|two[\s-]?factor code|authenticator code|verification code|\btotp\b|secret key|\bsecret\b|api[\s-]?key|access[\s-]?token|refresh[\s-]?token|\btoken\b|session (?:cookie|id|token)|\bcookie\b|private key|credential|login details|database (?:url|password|connection)|connection string|env(?:ironment)? var(?:iable)?s?|signing secret|app secret)/i;
const REVEAL = /\b(show|give|tell|send|share|reveal|display|print|list|dump|leak|expose|read out|what(?:'s| is| are)|which is|get me|find|fetch|export|copy|paste|decrypt|crack|guess|hack|bypass|access (?:his|her|their|someone|another))\b/i;
const LEGIT = /\b(reset|change|forgot|forgotten|recover my own|set up|setup|turn on|turn off|enable|disable|create|generate|revoke|rotate|update|how (?:do|can|to) (?:i )?(?:reset|change|create|revoke|turn|set|use|add|enable|disable|connect))\b/i;
const PROMPT_LEAK = /\b(system prompt|your (?:instructions|prompt|rules)|ignore (?:all |your |the )?(?:previous|above|prior) (?:instructions|rules)|developer mode|jailbreak)\b/i;

export type GuardVerdict = { allowed: true } | { allowed: false; reply: string };

export function checkRequest(text: string): GuardVerdict {
  const t = text.replace(/\s+/g, " ");
  if (PROMPT_LEAK.test(t)) return { allowed: false, reply: "I can't share or change how I'm set up. I can help with your stock, leads, sales, prices and how to use VandLabs." };
  if (SECRET.test(t) && REVEAL.test(t) && !LEGIT.test(t)) {
    return { allowed: false, reply: "I can't share passwords, sign-in codes, API keys, tokens or other secrets, for anyone, and VandLabs never stores passwords in a form anyone can read. If someone has forgotten their password, an owner can send a one-time reset link from Settings → Team. API keys are shown once when created; revoke and create a new one in Settings → API access if one is lost." };
  }
  return { allowed: true };
}

const PATTERNS: RegExp[] = [
  /sk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, // Anthropic / OpenAI-style keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWTs
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/gi, // connection strings
  /\bAKIA[0-9A-Z]{16}\b/g, /\bya29\.[A-Za-z0-9_-]{20,}/g, /\bEAA[A-Za-z0-9]{30,}/g, /\bgh[pousr]_[A-Za-z0-9]{30,}/g, /\bvl_(?:live|test)_[A-Za-z0-9_-]{16,}/g,
  /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{50,}/g, /\bscrypt\$\S+/g, // password hashes
];

export function redactSecrets(text: string): string {
  return PATTERNS.reduce((out, re) => out.replace(re, (m, label?: string) => (typeof label === "string" && /^[a-z_-]+$/i.test(label) && m.includes(label) && /[:=]/.test(m) ? `${label}: [hidden]` : "[hidden]")), text);
}

/**
 * Redacts a stream: text is held back by a short tail so a secret split across two chunks is still caught, then released.
 */
export function redactingEmitter(emit: (text: string) => void, holdBack = 160): { write: (text: string) => void; end: () => void } {
  let buffer = "";
  return {
    write(text: string) {
      buffer += text;
      if (buffer.length <= holdBack) return;
      // Release up to the last whitespace before the hold-back window, so words (and secrets) are never cut in two.
      const cut = buffer.lastIndexOf(" ", buffer.length - holdBack);
      if (cut <= 0) return;
      emit(redactSecrets(buffer.slice(0, cut)));
      buffer = buffer.slice(cut);
    },
    end() { if (buffer) emit(redactSecrets(buffer)); buffer = ""; },
  };
}
