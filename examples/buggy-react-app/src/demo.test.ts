import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ProductCard } from "./components/ProductCard";
describe("demo baseline rendering", () => {
  it("renders a selectable cart button and initial count", () => {
    const html = renderToStaticMarkup(createElement(ProductCard));
    expect(html).toContain("Add to Cart");
    expect(html).toContain('data-testid="cart-count">0');
  });
});
