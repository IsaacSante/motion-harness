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
  const result = queue.then(() => doChatCompletion(args));
  // Chain the next call off this one regardless of whether it succeeded —
  // a failed request must still release the queue for the next caller.
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function doChatCompletion({ apiKey, model, messages, temperature = 0.2, maxCompletionTokens = 4096 }) {
  if (!apiKey) {
    throw new Error('chatCompletion requires an apiKey (set CEREBRAS_API_KEY)');
  }
  const res = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
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

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cerebras API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`Cerebras API response had no message content: ${JSON.stringify(data)}`);
  }
  return content;
}
