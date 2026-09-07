import { useState } from "react";
import { useNavigate } from "react-router-dom";
export function Login() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  return (
    <section className="card">
      <span className="eyebrow">02 / WRONG DESTINATION</span>
      <h2>Demo sign in</h2>
      <p>No password or backend required.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem("demo-user", email);
          navigate("/login");
        }}
      >
        <label>
          Email
          <input
            aria-label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </section>
  );
}
