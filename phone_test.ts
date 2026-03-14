/**
 * phone_test.ts — Unit tests for the phone parsing module.
 *
 * Run: deno task test
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseInput, ContactInputError } from "./src/utils/phone.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function phone(input: string, region?: string): string {
  return parseInput(input, region).contact.phone;
}

function names(input: string, region?: string) {
  const r = parseInput(input, region);
  return { firstName: r.contact.firstName, lastName: r.contact.lastName };
}

// ---------------------------------------------------------------------------
// E.164 and international formats
// ---------------------------------------------------------------------------

Deno.test("parses plain E.164", () => {
  assertEquals(phone("+4915123456789"), "+4915123456789");
});

Deno.test("parses E.164 with spaces", () => {
  assertEquals(phone("+49 151 23456789"), "+4915123456789");
});

Deno.test("parses with parentheses and hyphens", () => {
  assertEquals(phone("+7 (999) 123-45-67"), "+79991234567");
});

Deno.test("parses with dots as separators", () => {
  assertEquals(phone("+33.6.12.34.56.78"), "+33612345678");
});

Deno.test("parses 00 prefix", () => {
  assertEquals(phone("004915123456789"), "+4915123456789");
});

Deno.test("parses tel: prefix", () => {
  assertEquals(phone("tel:+4915123456789"), "+4915123456789");
});

Deno.test("parses tel: with dashes", () => {
  assertEquals(phone("tel:+49-151-2345-6789"), "+4915123456789");
});

// ---------------------------------------------------------------------------
// Unicode and encoding
// ---------------------------------------------------------------------------

Deno.test("parses full-width digits and plus", () => {
  // ００４９ １５１２ ３４５６７８９ — full-width characters
  assertEquals(phone("\uff10\uff10\uff14\uff19 \uff11\uff15\uff11\uff12 \uff13\uff14\uff15\uff16\uff17\uff18\uff19"), "+4915123456789");
});

Deno.test("parses Arabic-Indic digits", () => {
  // +٤٩ ١٥١٢ ٣٤٥٦٧٨٩
  assertEquals(phone("+\u0664\u0669 \u0661\u0665\u0661\u0662 \u0663\u0664\u0665\u0666\u0667\u0668\u0669"), "+4915123456789");
});

Deno.test("handles non-breaking spaces", () => {
  assertEquals(phone("+49\u00a0151\u00a023456789"), "+4915123456789");
});

// ---------------------------------------------------------------------------
// Regional numbers
// ---------------------------------------------------------------------------

Deno.test("parses Russian number with region flag", () => {
  assertEquals(phone("8 (999) 123-45-67 --region RU", undefined), "+79991234567");
});

Deno.test("parses Russian number with default region", () => {
  assertEquals(phone("8 (999) 123-45-67", "RU"), "+79991234567");
});

Deno.test("parses Russian 8-prefix (11 digits)", () => {
  assertEquals(phone("89991234567"), "+79991234567");
});

Deno.test("parses Russian 7-prefix (11 digits)", () => {
  assertEquals(phone("79991234567"), "+79991234567");
});

Deno.test("parses Russian bare 10-digit mobile (prepend +7)", () => {
  assertEquals(phone("9991234567"), "+79991234567");
});

Deno.test("parses Russian number with messy separators", () => {
  assertEquals(phone("8 (999) 123 - 45 - 67"), "+79991234567");
  assertEquals(phone("7-999-123-45-67"), "+79991234567");
});

Deno.test("parses French number with region", () => {
  assertEquals(phone("06 12 34 56 78 --region FR", undefined), "+33612345678");
});

// ---------------------------------------------------------------------------
// Name parsing
// ---------------------------------------------------------------------------

Deno.test("parses --name as first name when single word", () => {
  assertEquals(names("+4915123456789 --name Max"), { firstName: "Max", lastName: "" });
});

Deno.test("parses --name and splits on first space", () => {
  assertEquals(names("+4915123456789 --name \"Max Mustermann\""), {
    firstName: "Max",
    lastName: "Mustermann",
  });
});

Deno.test("parses --first and --last", () => {
  assertEquals(names("+4915123456789 --first Max --last Mustermann"), {
    firstName: "Max",
    lastName: "Mustermann",
  });
});

Deno.test("defaults first_name to Contact when no name given", () => {
  assertEquals(names("+4915123456789"), { firstName: "Contact", lastName: "" });
});

Deno.test("preserves Unicode in names", () => {
  assertEquals(names("+79991234567 --region RU --name Иван"), {
    firstName: "Иван",
    lastName: "",
  });
});

Deno.test("parses --name=value syntax", () => {
  assertEquals(names("+4915123456789 --name=Max"), { firstName: "Max", lastName: "" });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

Deno.test("throws on empty input", () => {
  assertThrows(() => parseInput(""), ContactInputError, "No input");
});

Deno.test("throws on no phone in input", () => {
  assertThrows(() => parseInput("--name Max"), ContactInputError, "No phone number");
});

Deno.test("throws on extensions", () => {
  assertThrows(
    () => parseInput("+4915123456789 ext 123"),
    ContactInputError,
    "extensions"
  );
});

Deno.test("throws on multiple numbers (multiple plus signs)", () => {
  assertThrows(
    () => parseInput("+4915123456789 +33612345678"),
    ContactInputError,
    "Multiple"
  );
});

Deno.test("throws on unclosed quote", () => {
  assertThrows(
    () => parseInput('+4915123456789 --name "Max'),
    ContactInputError,
    "Unclosed"
  );
});

Deno.test("throws on unknown flag", () => {
  assertThrows(
    () => parseInput("+4915123456789 --foo bar"),
    ContactInputError,
    "Unknown flag"
  );
});

Deno.test("throws on flag with missing value", () => {
  assertThrows(
    () => parseInput("+4915123456789 --name"),
    ContactInputError,
    "requires a value"
  );
});

Deno.test("throws on invalid region code", () => {
  assertThrows(
    () => parseInput("+4915123456789 --region INVALID"),
    ContactInputError,
    "Invalid region"
  );
});

Deno.test("throws on obviously malformed number", () => {
  assertThrows(
    () => parseInput("notanumber --name Max"),
    ContactInputError
  );
});
