import { useState } from "react";
export function ProductCard() {
  const [count, setCount] = useState(0);
  function handleAdd() {
    setCount(count + 2);
  }
  return (
    <section className="card">
      <span className="eyebrow">01 / INCORRECT UPDATE</span>
      <div className="product">⌨</div>
      <h2>Everyday keyboard</h2>
      <p>A satisfying click. A suspicious cart count.</p>
      <div className="row">
        <strong>$49</strong>
        <span>
          Cart: <b data-testid="cart-count">{count}</b>
        </span>
      </div>
      <button onClick={handleAdd}>Add to Cart</button>
    </section>
  );
}
