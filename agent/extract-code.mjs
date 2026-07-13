// Models frequently wrap output in a fenced code block even when told not
// to — pull the fence content out if present, otherwise trust the raw text.
export function extractCode(text) {
  const fenced = text.match(/```(?:ts|typescript)?\n([\s\S]*?)```/);
  const code = (fenced ? fenced[1] : text).trim();
  return code ? `${code}\n` : code;
}
