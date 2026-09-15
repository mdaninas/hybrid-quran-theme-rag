import { Component } from "react";

export default class GraphBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className="graph-error" role="alert">
        <p>Peta belum berhasil dimuat. Anda tetap dapat membaca jawaban dan panel Ayat.</p>
        <button className="message-copy-button" type="button" onClick={() => window.location.reload()}>Muat ulang halaman</button>
      </div>;
    }
    return this.props.children;
  }
}
