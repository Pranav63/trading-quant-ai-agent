"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password }),
    });
    if (res.ok) {
        window.location.href = "/dashboard"; 
    } else {
        setError("incorrect password");
        setLoading(false);
    }
    };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080810", fontFamily: "var(--dash-mono)" }}>
      <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc", marginBottom: 4 }}>⬡ trading agent</div>
          <div style={{ fontSize: 11, color: "#3a3a5a" }}>enter password to access</div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoFocus
            style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#e2e2e8", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
            onFocus={(e) => e.target.style.borderColor = "#2a2a6a"}
            onBlur={(e) => e.target.style.borderColor = "#1e1e2e"}
          />
          {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{ padding: "10px", background: loading ? "#111118" : "#13133a", color: loading ? "#4a4a6a" : "#7c7cdc", border: "1px solid #2a2a6a", borderRadius: 6, fontSize: 12, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.06em" }}
          >
            {loading ? "authenticating..." : "enter"}
          </button>
        </form>
      </div>
    </div>
  );
}