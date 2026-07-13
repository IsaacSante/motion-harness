# motion-harness agent

Standalone agent loop that turns a natural-language instruction into a real
scene file in a motion-harness project. Not coupled to the studio — plain
Node/ESM, no dependencies, callable from a CLI or imported as a function.

## Setup

```bash
cp agent/.env.example agent/.env
# edit agent/.env and set CEREBRAS_API_KEY (get one from cloud.cerebras.ai)
```

`.env` is gitignored — never commit a real key. `CEREBRAS_API_KEY` as a real
exported environment variable always takes priority over the `.env` file.

## Usage

```bash
node agent/cli.mjs <project-path> <scene-name> <instruction...>

# e.g.
node agent/cli.mjs ~/motion-harness-projects/my-project intro "a headline that rises and fades in, then holds for 2 seconds"
```

`scene-name` must be kebab-case (`a-z0-9-`) — it becomes both the filename
(`src/scenes/<scene-name>.ts`) and the registry key in `src/timeline.json`.

## What it actually does

1. **Builds context** from the target project: the `Scene`/`SceneCtx`
   contract, the kit's `catalog.json` (every tagged primitive/motif/layout/
   effect), the project's own `tokens.ts`, and an existing scene (`example.ts`
   if present) as a style/shape reference.
2. **Prompts Cerebras** (`gemma-4-31b` by default — a *preview* model per
   Cerebras's own classification, so treat it as provisional) to write one
   scene file matching that context, with a required exact export name so
   the next step doesn't have to parse the LLM's naming choices.
3. **Writes the file** to `src/scenes/<scene-name>.ts` and **deterministically
   patches `src/main.ts`** to import and register it (string-patching, not
   another LLM call — a bad generation should never risk corrupting the rest
   of the project).
4. **Typechecks the project.** If it fails, the compiler output (filtered to
   lines mentioning the new scene or `main.ts`) goes back to the model as a
   repair turn. Up to 3 attempts total before giving up.
5. Returns `{ success, sceneName, factoryName, code, attempts, errors? }`.
   On failure, whatever was last generated is left on disk (not deleted) so
   it can be picked up and fixed by hand or by another agent.

## What it does NOT do

- Doesn't touch `timeline.json` — the scene exists and is registered, but
  isn't automatically added as a clip. Use the studio (or edit the JSON) to
  actually place it on the timeline.
- Doesn't validate the *visual* result, only that it typechecks. A scene can
  compile cleanly and still look wrong — preview it before trusting it.
