# ZATCA QR: a 64-character Arabic company name breaks most npm packages

> The spec sentence everyone copies is **"The length shall be stored in one byte."**
> It stops being true at 128 bytes.
>
> Arabic is 2 bytes per character in UTF-8, so **64 Arabic characters = 128 bytes**.
> That is an ordinary Saudi company name.

**91.7%** of the 44,915 monthly npm downloads measured here go to packages that
fail at least one rule. Of 11 third-party packages measured, **2** pass every case.

**[Arabic write-up and full results →](https://opusstudiohq-max.github.io/arabic-invoice-mcp/zatca-qr/)**

---

## The rule

The TLV length field is a BER length, not a plain byte:

```
length < 128        one byte
128 <= length <= 255  0x81, then the length byte
256 <= length         0x82, then two bytes, big-endian
```

This is not our reading. It is settled on **ZATCA's own forum**, by a developer
whose QR code was rejected and who traced it to exactly this. In their words after
fixing it:

> our code assumed that the maximum length of the value is 1 byte and therefore
> when the value was bigger than 127, we were not properly convert it to TLV value

<https://zatca1.discourse.group/t/qr-code-rejected-when-tag-1-company-name-exceeds-127-characters/7202>

## Results

Measured 2026-09-01. Downloads are npm's last-month figure, fetched the same day.

| package | downloads/mo | score |
| --- | ---: | ---: |
| [`zatca-xml-js`](https://www.npmjs.com/package/zatca-xml-js) | 21,943 | 6/10 |
| [`@axenda/zatca`](https://www.npmjs.com/package/@axenda/zatca) | 17,376 | 6/10 |
| [`@talha7k/zatca-qr`](https://www.npmjs.com/package/@talha7k/zatca-qr) | 1,991 | **10/10** |
| [`@talha7k/zatca`](https://www.npmjs.com/package/@talha7k/zatca) | 1,729 | **10/10** |
| [`@pioneersoft/zatca-einvoice`](https://www.npmjs.com/package/@pioneersoft/zatca-einvoice) | 646 | 5/10 |
| [`@zatca/qr`](https://www.npmjs.com/package/@zatca/qr) | 503 | 6/10 |
| [`zatca-sdk`](https://www.npmjs.com/package/zatca-sdk) | 300 | 6/10 |
| [`zatca`](https://www.npmjs.com/package/zatca) | 190 | 2/10 |
| [`zatca-qr-tlv`](https://www.npmjs.com/package/zatca-qr-tlv) | 123 | 6/10 |
| [`zatca-qr-generator`](https://www.npmjs.com/package/zatca-qr-generator) | 104 | 6/10 |
| [`zatca-simplified-invoice-sdk`](https://www.npmjs.com/package/zatca-simplified-invoice-sdk) | 10 | 6/10 |

## Four distinct failure modes, all measured from bytes

Every row below came from calling the package's own public API and decoding the
bytes it produced — not from reading its source.

**1. `0x80` written as a short-form length** — `zatca-xml-js`, `zatca-sdk`,
`zatca-qr-generator`, `zatca-qr-tlv`, `zatca-simplified-invoice-sdk`

```
seller name: 64 Arabic chars (128 bytes)
emitted:  01 80 d8 b4 ...
expected: 01 81 80 d8 ...
```

**2. Length truncated to zero** — `zatca-xml-js`, `zatca-qr-generator`

```
seller name: 128 Arabic chars (256 bytes)
emitted:  01 00 d8 b4 ...     <- declares length 0, no error raised
expected: 01 82 01 00 ...
```

`Buffer.from([tag, 256, ...])` silently truncates 256 to `0x00`. Every following
tag is misparsed.

**3. Length replaced by U+FFFD** — `@axenda/zatca`, `@zatca/qr`

```
seller name: 64 Arabic chars (128 bytes)
emitted:  01 ef bf bd d8 b4 ...
expected: 01 81 80 d8 ...
```

The TLV is assembled as a JS **string**, and the length goes through
`Buffer.from(hex, 'hex').toString('utf-8')`. `0x80` is not valid UTF-8 alone, so it
becomes the replacement character — three bytes instead of one.

**4. Length counted in characters, not bytes** — `zatca`

```
seller name: "شركة" - 4 characters, 8 bytes
emitted:  01 04 d8 b4 ...
expected: 01 08 d8 b4 ...
```

This one does not need a long name. **Any** Arabic seller name produces a malformed
QR.

## We found it in our own code first

We went to measure other packages, noticed one of them writing BER lengths, went to
check which reading was right — and found **our own** code was wrong. It was in
three places, including our published QR checker tool, where the same bug is worse:
a validator that reads lengths in one byte tells a merchant their *correct* QR is
broken.

One of ours survived because its only test was `expect(result).toBeDefined()`.

All three were fixed before we measured anyone. The runner refuses to write
`results.json` at all if one of our own engines fails a case.

## Reported to the maintainers

A benchmark that finds a defect and does not tell its author is just gossip. Every
finding was filed as a public issue with a runnable reproduction and the fix:

| package | issue |
| --- | --- |
| `zatca-xml-js` | [wes4m/zatca-xml-js#61](https://github.com/wes4m/zatca-xml-js/issues/61) |
| `@axenda/zatca` | [axenda/zatca#19](https://github.com/axenda/zatca/issues/19) |
| `zatca` | [abdo-host/ZATCA-JS#1](https://github.com/abdo-host/ZATCA-JS/issues/1) |
| `zatca-qr-generator` | [Wasim-Zaman/zatca-qr-generator#1](https://github.com/Wasim-Zaman/zatca-qr-generator/issues/1) |
| `zatca-sdk` | [aashahin/zatca-sdk#1](https://github.com/aashahin/zatca-sdk/issues/1) |
| `zatca-simplified-invoice-sdk` | [sharahsa0-creator/zatca-simplified-invoice-sdk#6](https://github.com/sharahsa0-creator/zatca-simplified-invoice-sdk/issues/6) |

Three could not be reported: `@pioneersoft/zatca-einvoice` has issues disabled, and
`@zatca/qr` and `zatca-qr-tlv` declare no repository on npm. A test enforces that no
scored failure is published without either an issue link or a stated reason.

## The fix

```js
const berLength = (n) =>
  n < 0x80  ? [n] :
  n <= 0xFF ? [0x81, n] :
              [0x82, n >> 8, n & 0xFF];

const tlv = (tag, value) => {
  const bytes = Buffer.from(value, "utf-8");
  return Buffer.concat([Buffer.from([tag, ...berLength(bytes.length)]), bytes]);
};
```

A decoder must read the same forms. A single-byte reader sees `0x81` as a length of
129 and silently truncates the value — the same bug from the other side.

## Method

Each package is driven through its own public API, and the Base64 it returns is
decoded by `decode()` in [`run.mjs`](run.mjs) — a decoder written there that calls
nobody's code. Judging a library with its own decoder proves nothing.

The judgement is on **bytes**: the declared length, the form it was written in, tag
order, and the value after decoding. Cases live in [`cases.json`](cases.json), each
carrying the rule it tests and where that rule comes from — the spec text (4.1 and
Table 3) or the forum resolution. Disagree with a case and you are disagreeing with
a named source you can read.

```bash
cd zatca-qr-benchmark
npm install
node run.mjs --fetch && node build.mjs
node --test tests/
```

## Where we got the adapters wrong

Each package has a different interface, so each gets an adapter in `run.mjs`. **No
package's code is modified.**

On the first run **eight of thirteen scored 0/10**. A row of zeros is a pattern, not
a result — so we read every package's type definitions instead of guessing:

| package | what we assumed | what it actually is |
| --- | --- | --- |
| `@axenda/zatca` | `toBase64(tags)` | `toBase64` encodes a string; TLV is `tagsToBase64([new Tag(...)])` |
| `zatca-xml-js` | named fields | takes a UBL invoice document |
| `@pioneersoft/zatca-einvoice` | named fields | a fork of the above; UBL document |
| `zatca-qr-generator` | `tlvEncode([...])` | `tlvEncode(tag, value)`, one tag at a time |
| `zatca-qr-tlv` | amount as a string | takes **halalas** as an integer |
| `@zatca/qr` | `vatRegistrationNumber` | `vatNumber` and `total` |
| `zatca-simplified-invoice-sdk` | `invoiceTimestamp` | `timestamp` |
| `zatca-sdk` | phase-1 generator | phase 2; requires signature fields |
| `zatca` | a function | an async class: `new GenerateQrCode(...).toBase64()` |

Nine adapters were wrong. All were fixed before anything was published. **If an
adapter still misrepresents your package, please open an issue** — we do not assume
the remaining ones are perfect.

### One declared input transform

`zatca` rejects `2022-04-25T15:30:00Z` — the exact form in ZATCA's own spec example
— because its check requires fractional seconds. It also rejects `+03:00` offsets,
which is Saudi local time.

Left as-is it would score 0/10, and the table would say it *encodes* wrongly, which
is not what was measured. So it is driven with the format it accepts, and the
rejection shows up in the "timestamp verbatim" case alone. The transform is shown on
the results page, and a test prevents hiding it.

## Not measured here

- **Tags 6-9** (invoice hash, ECDSA signature, public key, ZATCA stamp). Phase 2, and
  not buildable without a real cryptographic stamp certificate.
- **Whether ZATCA actually accepts a code.** This measures structure against
  published text. We have no access to ZATCA's validator, and claim nothing we have
  not run.
- Packages exporting no phase-1 generator are listed as skipped with the reason, and
  are not scored.

## Files

```
cases.json        cases, rules, and the source each rule comes from
run.mjs           adapters, the independent decoder, and the gate on our own engines
build.mjs         builds index.html - no number in it is typed by hand
downloads.json    npm download counts, with the date they were measured
disclosures.json  what was reported, where, and what could not be
results.json      run output
tests/            fifteen guards on the benchmark itself
```

MIT. Part of [Arabic invoicing tools](https://opusstudiohq-max.github.io/arabic-invoice-mcp/).
