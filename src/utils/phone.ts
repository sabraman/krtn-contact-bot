/**
 * phone.ts — Phone number parsing, normalization, and validation.
 *
 * Design decisions:
 * - Extensions (ext 123, x123, доб. 123) are REJECTED with a clear error.
 *   Telegram contact cards have no extension field, so silently stripping them
 *   could mislead the user. Rejection is the safer, more honest behavior.
 * - Multiple numbers in one input are REJECTED. We cannot know which number
 *   the user intends to share.
 * - Text surrounding a number is REJECTED unless the extra text is a recognized
 *   flag (--name, --first, --last, --region). This prevents silent data loss.
 * - Unclosed quotes in flag values are REJECTED.
 */

import {
  parsePhoneNumber,
  isValidPhoneNumber,
  isPossiblePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

// ---------------------------------------------------------------------------
// Custom error type for user-input problems (validation, format, etc.)
// ---------------------------------------------------------------------------

export class ContactInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactInputError";
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedContact {
  /** E.164 formatted phone number, e.g. +4915123456789 */
  phone: string;
  /** Telegram first_name (always non-empty) */
  firstName: string;
  /** Telegram last_name (may be empty string) */
  lastName: string;
  /** vCard string */
  vcard: string;
}

export interface ParseResult {
  contact: ParsedContact;
  /** Human-readable display name used in vCard FN field */
  displayName: string;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Convert full-width Unicode digits and plus sign to ASCII equivalents. */
function normalizeFullWidth(input: string): string {
  return input
    // Full-width digits ０–９ (U+FF10–U+FF19) → 0–9
    .replace(/[\uFF10-\uFF19]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // Full-width plus ＋ (U+FF0B) → +
    .replace(/\uFF0B/gu, "+");
}

/** Convert Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Extended Arabic-Indic (۰۱۲۳۴۵۶۷۸۹) digits to ASCII. */
function normalizeArabicIndic(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/gu, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/gu, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Strip tel: / callto: URI prefixes. */
function stripUriPrefix(input: string): string {
  return input.replace(/^(?:tel|callto):[/\\]*/iu, "");
}

/** Convert "00" international prefix to "+". Only at the very start of digit sequence. */
function normalizeDoubleZeroPrefix(input: string): string {
  // After stripping whitespace, if string starts with 00 followed by a digit
  return input.replace(/^00(\d)/, "+$1");
}

/** Replace non-breaking spaces and other Unicode spaces with regular space. */
function normalizeSpaces(input: string): string {
  // \u00a0 = NBSP, \u202f = narrow no-break space, \u2007 = figure space, etc.
  return input.replace(/[\u00a0\u202f\u2007\u2008\u2009\u200a\u3000]/gu, " ");
}

/**
 * Normalize Russian phone number variants that libphonenumber-js won't accept
 * without the +7 prefix, even with region=RU.
 *
 * Handles (after all Unicode/URI stripping):
 *   8XXXXXXXXXX  (11 digits, leading 8)   → +7XXXXXXXXXX
 *   7XXXXXXXXXX  (11 digits, leading 7)   → +7XXXXXXXXXX
 *   9XXXXXXXXX   (10 digits, leading 9)   → +79XXXXXXXXX  (mobile)
 *
 * Numbers already starting with + are left untouched. Anything else is
 * passed through unchanged so libphonenumber can attempt its own parsing.
 */
function normalizeRussianPrefix(input: string): string {
  if (/^\+/.test(input)) return input;

  // Strip all separators to examine digit sequence only
  const digits = input.replace(/[\s\-().]/g, "");

  if (/^8\d{10}$/.test(digits)) return "+7" + digits.slice(1); // 8... → +7...
  if (/^7\d{10}$/.test(digits)) return "+" + digits;           // 7... → +7...
  if (/^9\d{9}$/.test(digits))  return "+7" + digits;          // 9XXXXXXXXX → +79...

  return input;
}

/**
 * Apply all digit and format normalization steps.
 * Does NOT do flag/arg splitting — that happens separately.
 */
function normalizePhoneChunk(raw: string): string {
  let s = raw.trim();
  s = normalizeSpaces(s);
  s = normalizeFullWidth(s);
  s = normalizeArabicIndic(s);
  s = stripUriPrefix(s);
  s = normalizeDoubleZeroPrefix(s);
  // Russian prefix normalization: 8.../7.../9... → +7...
  s = normalizeRussianPrefix(s);
  return s;
}

// ---------------------------------------------------------------------------
// Extension detection
// ---------------------------------------------------------------------------

/** Detect if a phone string contains an extension indicator. */
const EXTENSION_RE =
  /(?:\s+(?:ext|ext\.|extension|x|доб|доб\.)\s*[\d]+|;ext=[\d]+|[\s,]+(x|ext)[\s.]*[\d]+)/iu;

function containsExtension(input: string): boolean {
  return EXTENSION_RE.test(input);
}

// ---------------------------------------------------------------------------
// Argument/flag parser
// ---------------------------------------------------------------------------

interface RawArgs {
  /** The raw phone-number portion (everything before/not-a-flag) */
  phoneRaw: string;
  name?: string;
  first?: string;
  last?: string;
  region?: string;
}

/**
 * Shell-like tokenizer that handles:
 *   --flag value
 *   --flag=value
 *   "quoted value"
 *   'quoted value'
 *   unquoted value (single token)
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = input;

  while (i < s.length) {
    // skip whitespace
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }

    if (s[i] === '"' || s[i] === "'") {
      const quote = s[i];
      i++;
      let value = "";
      let closed = false;
      while (i < s.length) {
        if (s[i] === quote) {
          closed = true;
          i++;
          break;
        }
        if (s[i] === "\\" && i + 1 < s.length) {
          i++;
          value += s[i];
          i++;
        } else {
          value += s[i];
          i++;
        }
      }
      if (!closed) {
        throw new ContactInputError(`Unclosed quote in argument: ${quote}`);
      }
      tokens.push(value);
    } else {
      // unquoted token — read until whitespace or =
      let value = "";
      while (i < s.length && !/\s/.test(s[i])) {
        if (s[i] === "=" && value.startsWith("--")) {
          // treat = as separator for --flag=value
          i++;
          break;
        }
        value += s[i];
        i++;
      }
      tokens.push(value);
    }
  }

  return tokens;
}

const KNOWN_FLAGS = new Set(["--name", "--first", "--last", "--region"]);

/**
 * Parse the raw input string into phone number chunk + named flags.
 * The phone chunk is everything that is NOT a recognized flag or its value.
 */
function parseArgs(input: string): RawArgs {
  let tokens: string[];
  try {
    tokens = tokenize(input);
  } catch (err) {
    if (err instanceof ContactInputError) throw err;
    throw new ContactInputError(`Argument parsing failed: ${String(err)}`);
  }

  const flagValues: Record<string, string> = {};
  const phoneParts: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (KNOWN_FLAGS.has(token)) {
      const flag = token;
      i++;
      if (i >= tokens.length || tokens[i].startsWith("--")) {
        throw new ContactInputError(`Flag ${flag} requires a value.`);
      }
      flagValues[flag] = tokens[i];
      i++;
    } else if (token.startsWith("--")) {
      throw new ContactInputError(
        `Unknown flag: ${token}. Supported flags: --name, --first, --last, --region.`
      );
    } else {
      phoneParts.push(token);
      i++;
    }
  }

  return {
    phoneRaw: phoneParts.join(" "),
    name: flagValues["--name"],
    first: flagValues["--first"],
    last: flagValues["--last"],
    region: flagValues["--region"],
  };
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/** Collapse runs of whitespace in a name to single spaces and trim. */
function normalizeName(name: string): string {
  return name.replace(/\s+/gu, " ").trim();
}

interface ResolvedName {
  firstName: string;
  lastName: string;
  displayName: string;
}

function resolveName(args: Pick<RawArgs, "name" | "first" | "last">): ResolvedName {
  const name = args.name !== undefined ? normalizeName(args.name) : undefined;
  const first = args.first !== undefined ? normalizeName(args.first) : undefined;
  const last = args.last !== undefined ? normalizeName(args.last) : undefined;

  let firstName = "";
  let lastName = "";

  if (first !== undefined || last !== undefined) {
    firstName = first ?? "";
    lastName = last ?? "";
  } else if (name !== undefined) {
    // Split --name on first space: everything before → first, rest → last
    const spaceIdx = name.indexOf(" ");
    if (spaceIdx === -1) {
      firstName = name;
      lastName = "";
    } else {
      firstName = name.slice(0, spaceIdx);
      lastName = name.slice(spaceIdx + 1);
    }
  } else {
    // Default when no name flags provided
    firstName = "Contact";
    lastName = "";
  }

  // Telegram requires non-empty first_name
  if (!firstName) {
    firstName = lastName || "Contact";
    if (firstName === lastName) lastName = "";
  }

  const parts = [firstName, lastName].filter(Boolean);
  const displayName = parts.join(" ");

  return { firstName, lastName, displayName };
}

// ---------------------------------------------------------------------------
// vCard generation
// ---------------------------------------------------------------------------

/** Escape a string for a vCard text value (backslash, comma, semicolon, newline). */
function vCardEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

function buildVCard(phone: string, firstName: string, lastName: string): string {
  const fn = vCardEscape(`${firstName}${lastName ? " " + lastName : ""}`.trim());
  const n = `${vCardEscape(lastName)};${vCardEscape(firstName)};;;`;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${fn}`,
    `N:${n}`,
    `TEL;TYPE=CELL:${phone}`,
    "END:VCARD",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// Region validation
// ---------------------------------------------------------------------------

// Simple ISO 3166-1 alpha-2 pattern — libphonenumber internally validates
// further, this is just a quick sanity check.
const ISO_REGION_RE = /^[A-Z]{2}$/;

function validateRegion(region: string): CountryCode {
  const upper = region.toUpperCase();
  if (!ISO_REGION_RE.test(upper)) {
    throw new ContactInputError(
      `Invalid region code: "${region}". Use a 2-letter ISO 3166-1 country code (e.g. DE, RU, FR).`
    );
  }
  return upper as CountryCode;
}

// ---------------------------------------------------------------------------
// Multiple number detection
// ---------------------------------------------------------------------------

/**
 * Very conservative check: if after removing all recognized separator chars
 * (spaces, dashes, dots, parens, plus) there are more than one contiguous
 * runs of digits that look like they could be separate phone numbers, reject.
 * We take the practical approach: if the cleaned phone chunk contains more
 * than one "+" sign or more than one "00" prefix pattern, we consider it
 * potentially multi-number and reject to be safe.
 */
function looksLikeMultipleNumbers(phoneRaw: string): boolean {
  // Count explicit international prefixes
  const plusCount = (phoneRaw.match(/\+/g) ?? []).length;
  if (plusCount > 1) return true;

  // Count 00-prefix starts after removing leading whitespace segments
  const doubleZeroCount = (phoneRaw.match(/(?:^|\s)00\d/g) ?? []).length;
  if (doubleZeroCount > 1) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a raw user input string into a validated ParseResult.
 *
 * @param input - The full user input string (e.g. the command payload or inline query).
 * @param defaultRegion - Optional default region from env var DEFAULT_REGION.
 * @throws ContactInputError on invalid/malformed input.
 */
export function parseInput(input: string, defaultRegion?: string): ParseResult {
  // 1. Normalize spaces and Unicode
  const normalized = normalizeSpaces(input.trim());

  if (!normalized) {
    throw new ContactInputError(
      "No input provided. Usage: /contact +49 1512 3456789 --name \"Max\""
    );
  }

  // 2. Parse args/flags
  const args = parseArgs(normalized);

  if (!args.phoneRaw.trim()) {
    throw new ContactInputError(
      "No phone number found. Usage: /contact +49 1512 3456789 --name \"Max\""
    );
  }

  // 3. Detect multiple numbers before normalization
  if (looksLikeMultipleNumbers(args.phoneRaw)) {
    throw new ContactInputError(
      "Multiple phone numbers detected. Please provide exactly one phone number."
    );
  }

  // 4. Normalize the phone chunk
  const phoneNormalized = normalizePhoneChunk(args.phoneRaw);

  // 5. Detect extensions — we reject rather than silently strip
  if (containsExtension(phoneNormalized)) {
    throw new ContactInputError(
      "Phone number extensions (ext, x, доб.) are not supported. " +
        "Telegram contact cards have no extension field. Please omit the extension."
    );
  }

  // 6. Resolve region
  let region: CountryCode | undefined;
  if (args.region) {
    region = validateRegion(args.region);
  } else if (defaultRegion) {
    region = validateRegion(defaultRegion);
  }

  // 7. Parse with libphonenumber-js
  let parsed;
  try {
    parsed = parsePhoneNumber(phoneNormalized, region);
  } catch (err) {
    // parsePhoneNumber throws ParseError with .message describing the issue
    const msg = err instanceof Error ? err.message : String(err);
    throw new ContactInputError(
      buildParseErrorMessage(msg, phoneNormalized, region)
    );
  }

  // 8. Validate: possible then valid
  if (!isPossiblePhoneNumber(phoneNormalized, region)) {
    throw new ContactInputError(
      `"${phoneNormalized}" is not a possible phone number. Check for missing or extra digits.`
    );
  }
  if (!isValidPhoneNumber(phoneNormalized, region)) {
    throw new ContactInputError(
      buildValidationErrorMessage(phoneNormalized, region)
    );
  }

  const e164 = parsed.format("E.164");

  // 9. Resolve names
  const { firstName, lastName, displayName } = resolveName(args);

  // 10. Build vCard
  const vcard = buildVCard(e164, firstName, lastName);

  return {
    contact: {
      phone: e164,
      firstName,
      lastName,
      vcard,
    },
    displayName,
  };
}

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

function buildParseErrorMessage(
  libError: string,
  phone: string,
  region: CountryCode | undefined
): string {
  if (libError.includes("NOT_A_NUMBER")) {
    return (
      `"${phone}" does not look like a phone number. ` +
      "Use international format like +49 1512 3456789 or supply --region."
    );
  }
  if (libError.includes("INVALID_COUNTRY")) {
    return `Invalid or unsupported country/region. Provide a valid --region code (e.g. --region DE).`;
  }
  if (libError.includes("TOO_SHORT") || libError.includes("TOO_LONG")) {
    return `"${phone}" has too ${libError.includes("SHORT") ? "few" : "many"} digits for a valid phone number.`;
  }
  const regionHint = region ? ` (region: ${region})` : " (no region specified)";
  return `Could not parse "${phone}"${regionHint}: ${libError}`;
}

function buildValidationErrorMessage(
  phone: string,
  region: CountryCode | undefined
): string {
  const regionHint = region
    ? ` in region ${region}`
    : ". Try adding --region XX with your country code";
  return (
    `"${phone}" is not a valid phone number${regionHint}. ` +
    "Make sure the number exists and is in a recognizable format."
  );
}
