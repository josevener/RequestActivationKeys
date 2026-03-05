import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    const result = await login(username.trim(), password);

    setLoading(false);

    if (!result.ok) {
      setError(result.message || "Login failed");
      return;
    }

    navigate("/requests", { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fb",
        padding: "16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "550px",
          background: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
          display: "grid",
          gap: "14px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Key Approval App</h1>

        {error ? (
          <div
            style={{
              border: "1px solid #f3b1b1",
              background: "#fff0f0",
              color: "#8e1f1f",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
          >
            {error}
          </div>
        ) : null}

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            disabled={loading}
            style={{
              width: "100%",
              border: "1px solid #ccd3df",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
            style={{
              width: "100%",
              border: "1px solid #ccd3df",
              borderRadius: "8px",
              padding: "10px 12px",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            border: "none",
            borderRadius: "8px",
            background: loading ? "#9eb2d4" : "#325ea8",
            color: "#ffffff",
            padding: "11px 12px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
