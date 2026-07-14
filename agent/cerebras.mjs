// Thin client for Cerebras's OpenAI-compatible chat completions endpoint.
// https://inference-docs.cerebras.ai/api-reference/chat-completions
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';

// A single generateScene() call already awaits every request in sequence —
// nothing to serialize there. What isn't serialized is across separate
// calls: the studio server handles each incoming HTTP request
// independently, so two overlapping "generate" requests (two tabs, a
// double-click, one call's design-pass work overlapping another call's
// typecheck-repair work) fire their Cerebras requests interleaved. This
// queue makes every chatCompletion() call in this process wait for the
// previous one to finish first, regardless of which generateScene() call it
// belongs to — one request in flight, process-wide, at a time.
let queue = Promise.resolve();

export function chatCompletion(args) {
  const result = queue.then(() => doChatCompletionWithRetry(args));
  // Chain the next call off this one regardless of whether it succeeded —
  // a failed request must still release the queue for the next caller.
  queue = result.then(() => undefined, () => undefined);
  return result;
}

class CerebrasHttpError extends Error {
  constructor(status, body) {
    super(`Cerebras API error ${status}: ${body}`);
    this.status = status;
  }
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 (Cerebras's queue is full, per PLAN.md-adjacent reports of
// "queue_exceeded") and 5xx are the server saying "busy, try again soon".
// A bare fetch() rejection (Node's "TypeError: fetch failed") means the
// request never got a response at all — connection reset, timeout, DNS —
// which under the same overload is just as likely to clear up on retry.
// Anything else (bad API key, malformed request) won't fix itself.
function isTransient(err) {
  if (err instanceof CerebrasHttpError) return err.status === 429 || err.status >= 500;
  return true;
}

async function doChatCompletionWithRetry(args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await doChatCompletion(args);
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isTransient(err)) throw err;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
      console.warn(`Cerebras request failed (${err.message}); retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
    }
  }
}

async function doChatCompletion({ apiKey, model, messages, temperature = 0.2, maxCompletionTokens = 4096 }) {
  if (!apiKey) {
    throw new Error('chatCompletion requires an apiKey (set CEREBRAS_API_KEY)');
  }

  let res;
  try {
    res = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxCompletionTokens,
      }),
    });
  } catch (err) {
    // Node's fetch throws a bare "TypeError: fetch failed" for connection-
    // level failures and tucks the actual reason away in err.cause — surface
    // it so this doesn't just show up as an unexplained "fetch failed".
    const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new Error(`Cerebras request failed${cause}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new CerebrasHttpError(res.status, body);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Cerebras API response had no message content: ${JSON.stringify(data)}`);
  }
  return content;
}
