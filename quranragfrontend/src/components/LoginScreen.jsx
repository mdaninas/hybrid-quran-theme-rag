import { useState } from "react";
import {
  ArrowRightIcon,
  AtlasPreviewSvg,
  BookOpenIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from "./Icons";

function nameFromEmail(email) {
  const raw = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!raw) return "Penjelajah";
  return raw.replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Isi email dan kata sandi untuk masuk ke mode demo.");
      return;
    }
    setError("");
    onLogin({
      email: email.trim(),
      name: nameFromEmail(email),
      mode: "local",
      remember,
    });
  };

  const handleGuestLogin = () => {
    onLogin({ name: "Tamu", email: "", mode: "guest", remember: false });
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-top">
          <span className="brand-mark brand-mark-light"><BookOpenIcon size={24} /></span>
          <div>
            <strong>Ruang Jelajah</strong>
            <span>Atlas tematik</span>
          </div>
        </div>

        <div className="login-story">
          <p className="login-kicker">Knowledge graph Al-Qur&apos;an</p>
          <h1>Peta tema, ayat, dan surah.</h1>
          <p>
            Tanyakan sebuah tema. Relasi tampil di peta; ayat terkait jadi legenda di sisinya.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="login-atlas"
          style={{
            "--atlas-theme-fill": "var(--canvas)",
            "--atlas-theme-stroke": "var(--terracotta)",
            "--atlas-theme-text": "var(--slate)",
          }}
        >
          <AtlasPreviewSvg size={220} />
          <div className="graph-legend-preview">
            <span><i className="legend-dot theme" /> Tema</span>
            <span><i className="legend-dot verse" /> Ayat</span>
            <span><i className="legend-dot surah" /> Surah</span>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-mobile-brand">
          <span className="brand-mark"><BookOpenIcon size={24} /></span>
          <strong>Ruang Jelajah</strong>
        </div>

        <div className="login-form-wrap">
          <h2>Masuk</h2>
          <p className="login-subtitle">Mode demo. Peta memakai graf lokal.</p>

          <div className="local-mode-note">
            <span className="local-mode-dot" />
            <p>
              <strong>Mode demo lokal</strong>
              <br />
              Data masuk hanya disimpan di browser ini.
            </p>
          </div>

          <button
            className="primary-button guest-button"
            onClick={handleGuestLogin}
            type="button"
          >
            Masuk sebagai tamu
          </button>
          <p className="guest-note">Mode tamu tidak menyimpan profil saat browser ditutup.</p>

          <div className="login-divider"><span>atau mode demo</span></div>

          <form className="login-demo-form" onSubmit={handleSubmit} noValidate>
            <label className="field-label" htmlFor="email">Email</label>
            <div className="input-shell">
              <MailIcon size={20} />
              <input
                autoComplete="email"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@email.com"
                type="email"
                value={email}
              />
            </div>

            <label className="field-label" htmlFor="password" style={{ display: "block", marginTop: "var(--space-4)" }}>
              Kata sandi
            </label>
            <div className="input-shell">
              <LockIcon size={20} />
              <input
                autoComplete="current-password"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Masukkan kata sandi"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                className="icon-button input-action"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
              </button>
            </div>

            <label className="remember-row">
              <input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
              <span>Ingat saya di perangkat ini</span>
            </label>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <button className="secondary-button login-submit" type="submit">
              Masuk demo <ArrowRightIcon size={20} />
            </button>
          </form>
        </div>

        <footer className="login-footer">
          Ruang Jelajah · Periksa ayat sebelum mengutip.
        </footer>
      </section>
    </main>
  );
}
