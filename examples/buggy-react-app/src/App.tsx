import { Link, Route, Routes } from "react-router-dom";
import { ProductCard } from "./components/ProductCard";
import { Login } from "./components/Login";
import { MutableList } from "./components/MutableList";
export function App() {
  return (
    <main>
      <header>
        <span className="mark">R / S</span>
        <span>
          REACT SURGEON <small>INTERACTIVE BUG LAB</small>
        </span>
        <span className="badge">LOCAL · CPU ONLY</span>
      </header>
      <section className="intro">
        <span className="eyebrow">THREE BUGS. REAL PROOF.</span>
        <h1>
          Something's broken.
          <br />
          <em>Find it. Fix it. Prove it.</em>
        </h1>
        <p>
          A small React app with reproducible defects. Select an element using
          the Surgeon overlay, describe the bug, and replay an acceptance
          scenario.
        </p>
      </section>
      <nav>
        <Link to="/">Cart & list</Link>
        <Link to="/login">Demo login</Link>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <div className="grid">
              <ProductCard />
              <MutableList />
            </div>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <section className="card">
              <h2>Dashboard</h2>
              <p>You're signed in.</p>
            </section>
          }
        />
      </Routes>
      <footer>
        NO CLOUD. NO GUESSWORK. <span>Verification decides.</span>
      </footer>
    </main>
  );
}
