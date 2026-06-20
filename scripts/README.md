# scripts/

## Persona pipeline test

```bash
# real personas (needs ANTHROPIC_API_KEY in .env)
npm run test:persona

# only some objects (substring match on filename)
npm run test:persona mug shoe stapler
```

`test-persona.ts` runs the real `awaken()` pipeline (vision → Claude → persona)
on every image in `sample-images/`, then one `reply()` turn so you can read each
character's opening line aloud and judge whether it's funny. With no
`ANTHROPIC_API_KEY` it runs the mock path and says so — it never hard-fails, and
a degraded/fallback persona is flagged in the output.

## sample-images/

Eight stock object photos used as fixtures: water bottle, stapler, coffee mug,
headphones, shoe, smartphone, backpack, charging cable. Sourced from
[Openverse](https://openverse.org) (open-licensed) and
[Unsplash](https://unsplash.com); each was visually confirmed to depict its
object. To test your own objects, just drop more `.jpg`/`.png`/`.webp` files in
this folder — the harness picks up everything it finds.
