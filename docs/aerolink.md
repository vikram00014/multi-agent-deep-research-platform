# Connecting to Aerolink (Anthropic-compatible LLM gateway)

A practical guide to calling Claude models through the Aerolink gateway from your own code.
Everything here was verified by direct testing, not taken from vendor documentation.

Aerolink is an **unofficial third-party proxy**, not an Anthropic service. Read
[Risks and limitations](#risks-and-limitations) before building anything you depend on.

---

## 1. Get a key

Sign up at `aerolink.lat` and create a key in the dashboard. Keys look like
`aero_live_...`. The free trial releases credit on a rolling schedule — roughly
**$5 per 5-hour window**, with unused balance expiring weekly.

Put the key in an environment file, never in source:

```bash
# .env  (make sure this is gitignored)
LLM_API_KEY=aero_live_your_key_here
LLM_BASE_URL=https://api.aerolink.lat/v1
LLM_MODEL=claude-sonnet-5
```

---

## 2. Endpoint and authentication

```
POST https://api.aerolink.lat/v1/messages

Authorization: Bearer aero_live_...
anthropic-version: 2023-06-01
Content-Type: application/json
```

**Use `Authorization: Bearer`.** The native Anthropic header `x-api-key` does not work
here — and it fails badly: instead of returning `401`, the request **hangs until it times
out**. If you write a fallback that tries both schemes, give each attempt its own short
timeout, or a hung attempt will stall startup.

The payload is the standard Anthropic Messages format, so any Anthropic-compatible client
library works.

### Minimal request

```python
import httpx

resp = httpx.post(
    "https://api.aerolink.lat/v1/messages",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    },
    json={
        "model": "claude-sonnet-5",
        "max_tokens": 4096,
        "system": "You are concise.",   # optional; top-level, NOT a message
        "messages": [{"role": "user", "content": "Hello"}],
    },
    timeout=600,   # see gotcha #4
)
```

### Available models

`GET /v1/models` lists them. This endpoint keeps working even when generation is blocked,
which makes it a useful key-liveness check.

```
claude-opus-5           claude-sonnet-5
claude-opus-4-8         claude-sonnet-4-6
claude-opus-4-7         claude-fable-5
claude-opus-4-6         claude-haiku-4-5-20251001
```

All report `supported_endpoint_types: ["anthropic"]` — there is **no** OpenAI-compatible
`/chat/completions` endpoint.

---

## 3. Four gotchas

These are current-Claude-model behaviours, not Aerolink quirks. They apply to Anthropic
direct too.

### Do not send `temperature`

Current models reject it outright:

```
HTTP 400 — `temperature` is deprecated for this model
```

Omit the field entirely.

### Extended thinking uses new syntax

```python
# WRONG — HTTP 400: thinking.type.enabled is not supported
"thinking": {"type": "enabled", "budget_tokens": 2000}

# RIGHT
"thinking": {"type": "adaptive"},
"output_config": {"effort": "medium"}      # low | medium | high
```

### Parse `content` as a list of blocks

`content` is an array. With thinking enabled, the first block is a `thinking` block and
your answer is in a later `text` block. Reading `content[0]["text"]` returns an empty
string and looks like the model produced nothing.

```python
text = "".join(
    b.get("text", "")
    for b in resp.json()["content"]
    if b.get("type") == "text"
)
```

### Use a generous timeout

A 16k-token generation runs for several minutes. A 120-second timeout will kill your
longest call on every run while all the short ones succeed — which reads like a random
failure rather than a timeout. Use 600 seconds.

---

## 4. Error handling

| Status | Meaning | What to do |
|---|---|---|
| `200` | Success | — |
| `402` | `5-hour included-usage limit reached` | Wait for the window to reset, or add balance. **Do not retry** — it cannot succeed. |
| `400` + `anomaly in your client` | Key is fingerprint-flagged | Switch keys. The flag clears on its own over time. |
| `429`, `5xx` | Transient | Exponential backoff |

### Treat 402 as a valid key

If you validate the key at startup, a `402` means the key **authenticated correctly** and
merely lacks balance. Failing validation on it produces a misleading "key rejected" error
and sends you hunting for an auth bug that isn't there.

```python
if resp.status_code in (200, 402):
    return True          # key is valid
if resp.status_code in (401, 403):
    return False         # key is genuinely bad
```

### The client-fingerprinting block

Aerolink inspects request characteristics and rejects traffic it thinks isn't the official
Claude Code client:

```json
{"error": {"message": "We have detected an anomaly in your client.
 Please use the standard Claude Code client for requests."}}
```

Observed behaviour:

- It is **per-key, not per-endpoint** — one key can be blocked while another works from the
  same code, same headers, same moment.
- It **moves between keys over time**. A key blocked in the morning worked by evening, while
  a second key went the other way. It appears to trip on recent request volume.
- **Headers do not help.** Setting `User-Agent` to a browser, `curl`, or omitting it made no
  difference.

If you have more than one key, implement a fallback. Do not attempt to spoof the Claude
Code client signature — that is deliberately circumventing access control, and it breaks
whenever they update the check.

---

## 5. Two things that will surprise you

### The response `model` field is wrong

It reports `claude-opus-5` regardless of what you requested. Your dashboard logs show the
model actually used and billed. **Never diagnose model selection or cost from the response
body** — verify in the dashboard.

### Shared keys share quota

Every request carries roughly 40–80k `cache_read_input_tokens` of gateway-injected context,
even for a three-word prompt. At $5 per 5-hour window that allows only about a dozen calls
of real work.

Critically: **if the same key is configured in both your coding assistant and your
application, they draw from one budget.** Long assistant sessions will starve your app.
Use a separate key per consumer.

---

## 6. Using Aerolink with Claude Code

Claude Code uses a **different host** — note `capi` and the absence of `/v1`:

```bash
ANTHROPIC_BASE_URL=https://capi.aerolink.lat
ANTHROPIC_API_KEY=aero_live_...
```

That host serves an HTML dashboard in response to direct API POSTs; it is for the Claude
Code client only. Your own applications must use `https://api.aerolink.lat/v1`.

---

## 7. Switching to Anthropic direct

The code above is provider-agnostic. To move off the gateway, change one line:

```bash
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-...
```

Everything in [Four gotchas](#3-four-gotchas) still applies. The `402` quota behaviour and
the fingerprint block are gateway-specific and disappear.

Anthropic direct also accepts `x-api-key`, which is its documented header.

For cost-sensitive work, `claude-haiku-4-5-20251001` is roughly an order of magnitude
cheaper than Sonnet and often sufficient.

---

## Risks and limitations

Aerolink is an unofficial reverse proxy reselling Claude access.

- **Your data passes through their servers in plaintext** — prompts, code, uploaded
  documents. Do not send proprietary source, credentials, or personal data.
- **Model authenticity is disputed.** Some users report benchmark results inconsistent with
  the advertised models.
- **Availability is not guaranteed.** The fingerprinting described above appeared without
  notice and changed which keys worked. Endpoints and limits can change at any time.
- **Terms of service.** Accessing Claude through an unofficial reseller may conflict with
  Anthropic's usage policies, and the provenance of the upstream credentials is unclear.

Reasonable for experiments and hobby projects. For anything you rely on, use an official
route: an Anthropic API key, or Claude via AWS Bedrock or Google Vertex AI.
