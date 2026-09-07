import { useState } from "react";
export function MutableList() {
  const [items, setItems] = useState(["Keyboard", "Notebook", "Desk lamp"]);
  function remove(index: number) {
    items.splice(index, 1);
    setItems(items);
  }
  return (
    <section className="card">
      <span className="eyebrow">03 / MUTATED STATE</span>
      <h2>Your shortlist</h2>
      <p>Remove an item. Does the list respond?</p>
      <ul>
        {items.map((item, index) => (
          <li key={item}>
            {item}
            <button aria-label={`Remove ${item}`} onClick={() => remove(index)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p data-testid="list-count">{items.length} items</p>
    </section>
  );
}
