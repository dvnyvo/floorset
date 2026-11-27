import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../../app/lib/glossary";

// The info tooltips and the README glossary must say the same thing.
describe("glossary", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

  it.each(Object.values(GLOSSARY))("README defines $term with the tooltip's sentence", ({ text }) => {
    expect(readme).toContain(text);
  });
});
