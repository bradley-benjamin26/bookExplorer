import { describe, expect, it } from "vitest";
import { englishOrNull, looksEnglish } from "./language.js";

describe("looksEnglish", () => {
  it.each([
    "Bilbo Baggins, a respectable, well-to-do hobbit, lives comfortably in his hobbit-hole until the day the wandering wizard Gandalf chooses him.",
    "A novel.", // under 5 words: kept, too short to judge
  ])("keeps English: %s", (t) => expect(looksEnglish(t)).toBe(true));
  it.each([
    "Bilbo Bessac est un hobbit qui vit tranquillement dans son trou jusqu'au jour où le magicien Gandalf le choisit pour une aventure.",
    "Bilbo Bolsón es un hobbit que vive cómodamente en su agujero hasta el día en que el mago Gandalf lo elige para una aventura.",
    "Bilbo Beutlin ist ein Hobbit, der gemütlich in seiner Höhle lebt, bis der Zauberer Gandalf ihn für ein Abenteuer auswählt.",
    "ビルボ・バギンズは裕福なホビットで、魔法使いガンダルフに冒険へ誘われる。",
  ])("rejects non-English: %s", (t) => expect(looksEnglish(t)).toBe(false));
});

describe("englishOrNull", () => {
  it("passes null, English and drops non-English", () => {
    expect(englishOrNull(null)).toBeNull();
    expect(englishOrNull("A novel.")).toBe("A novel.");
    expect(englishOrNull("Bilbo Bolsón es un hobbit que vive cómodamente en su agujero hasta el día en que el mago Gandalf lo elige.")).toBeNull();
  });
});
