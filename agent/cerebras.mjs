// Thin client for Cerebras's OpenAI-compatible chat completions endpoint.
// https://inference-docs.cerebras.ai/api-reference/chat-completions
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';

export async function chatCompletion({ apiKey, model, messages, temperature = 0.2, maxCompletionTokens = 4096 }) {
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
