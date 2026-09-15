import { useState } from "react";
import { ArrowRightIcon, AtlasPreviewSvg, BookOpenIcon } from "./Icons";

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  return <main className="login-page">
    <section className="login-brand-panel">
      <div className="login-brand-top"><span className="brand-mark brand-mark-light"><BookOpenIcon size={24} /></span><div><strong>Ruang Jelajah</strong><span>Atlas tematik</span></div></div>
      <div className="login-story"><p className="login-kicker">Knowledge graph Al-Qur&apos;an</p><h1>Peta tema, ayat, dan surah.</h1><p>Tanyakan sebuah tema. Telusuri hubungan di peta dan baca ayat yang mendasari jawaban.</p></div>
      <div aria-hidden="true" className="login-atlas"><AtlasPreviewSvg size={220} /><div className="graph-legend-preview"><span><i className="legend-dot theme" /> Tema</span><span><i className="legend-dot verse" /> Ayat</span><span><i className="legend-dot surah" /> Surah</span></div></div>
    </section>
    <section className="login-form-panel">
      <div className="login-mobile-brand"><span className="brand-mark"><BookOpenIcon size={24} /></span><strong>Ruang Jelajah</strong></div>
      <div className="login-form-wrap">
        <h2>Mulai menjelajah</h2><p className="login-subtitle">Temukan ayat melalui tema yang ingin Anda pahami.</p>
        <div className="local-mode-note"><span className="local-mode-dot" /><p><strong>Demo tanpa akun</strong><br />Profil dan riwayat disimpan di browser ini. Pertanyaan dikirim ke layanan AI untuk mencari dan menyusun jawaban.</p></div>
        <button className="primary-button guest-button" onClick={() => onLogin({ name: "Tamu", mode: "guest", remember: false })} type="button">Masuk sebagai tamu</button>
        <p className="guest-note">Profil tamu dan riwayat hanya disimpan untuk sesi tab ini.</p>
        <div className="login-divider"><span>atau gunakan nama Anda</span></div>
        <form className="login-demo-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onLogin({ name: name.trim(), mode: "local", remember }); }}>
          <label className="field-label" htmlFor="display-name">Nama panggilan</label>
          <div className="input-shell"><input autoComplete="nickname" id="display-name" maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" required type="text" value={name} /></div>
          <label className="remember-row"><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /><span>Ingat nama saya di perangkat ini</span></label>
          <button className="secondary-button login-submit" disabled={!name.trim()} type="submit">Mulai jelajah <ArrowRightIcon size={20} /></button>
        </form>
      </div>
      <footer className="login-footer">Ruang Jelajah · Periksa ayat sebelum mengutip.</footer>
    </section>
  </main>;
}
