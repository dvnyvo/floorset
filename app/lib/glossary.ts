// One-sentence definitions for first-time viewers. The info tooltips use these, and the README glossary
// repeats them word for word (tests/lib/glossary.test.ts checks that).
export const GLOSSARY = {
  rfidTag: {
    term: "RFID-encoded tag",
    text: "A tag in each garment with its own ID (its EPC), which a handheld reader picks up without needing to see it.",
  },
  readRate: {
    term: "Read rate",
    text: "The share of the stock Shopify says is on hand that an RFID scan actually found; the target is 95%.",
  },
  looseTag: {
    term: "Loose tag",
    text: "An RFID-encoded tag that still reads after its garment has left the store, usually because it was cut off during a theft.",
  },
  sizeRun: {
    term: "Size run",
    text: "The sizes a fixture shows for one item, for example 1 XXS, 2 XS, 3 S, 3 M, 2 L and 1 XL on a rail.",
  },
  swapOut: {
    term: "Swap-out",
    text: "An item whose size run can't be refilled from backstock, so it's replaced with a different item that can.",
  },
  backstock: {
    term: "Backstock",
    text: "Stock kept in the stockroom, used to refill the sales floor.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
