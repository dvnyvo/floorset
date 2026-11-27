// Small info button with a one-sentence tooltip from the glossary. A button, so it works by keyboard too.
import { useId } from "react";
import { GLOSSARY, type GlossaryKey } from "../lib/glossary";

export function Info({ term }: { term: GlossaryKey }) {
  const id = useId();
  const g = GLOSSARY[term];
  return (
    // Pull the next character in past the button's 4px padding and the icon's own margin, so "tags ⓘ." has no gap before the period.
    <span style={{ marginInlineEnd: "-6px" }}>
      <s-button variant="tertiary" icon="info" accessibilityLabel={`${g.term}: ${g.text}`} interestFor={id} />
      <s-tooltip id={id}>{g.text}</s-tooltip>
    </span>
  );
}
