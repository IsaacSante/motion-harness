// Targeted find-and-replace edits for design-refinement passes — the same
// old/new exact-match contract as this project's own coding tool, not a
// unified diff (line-numbered context hunks are brittle against a model
// that reformats whitespace) and not a full-file rewrite (regenerating the
// whole scene for a spacing tweak has far more surface area to accidentally
// break something the pass wasn't even trying to touch).

// Models frequently wrap JSON in a fenced code block even when told not to
// — same tolerance as extract-code.mjs's TS-fence handling.
export function extractEdits(text) {
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)```/);
  const jsonText = (fenced ? fenced[1] : text).trim();
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error('expected a JSON array of edits');
  }
  return parsed;
}

export function applyEdits(code, edits) {
  let result = code;
  for (const edit of edits) {
    const oldStr = edit?.old;
    const newStr = edit?.new;
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
      throw new Error('each edit must have string "old" and "new" fields');
    }
    const occurrences = result.split(oldStr).length - 1;
    if (occurrences === 0) {
      throw new Error(`edit "old" text not found in the current file: ${JSON.stringify(oldStr.slice(0, 80))}`);
    }
    if (occurrences > 1) {
      throw new Error(`edit "old" text is ambiguous (appears ${occurrences} times): ${JSON.stringify(oldStr.slice(0, 80))}`);
    }
    result = result.replace(oldStr, newStr);
  }
  return result;
}
