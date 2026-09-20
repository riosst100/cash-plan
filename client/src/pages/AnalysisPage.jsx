import AnalysisResult from "../components/AnalysisResult.jsx";

export default function AnalysisPage({ result }) {
  return (
    <section>
      {result ? (
        <AnalysisResult result={result} />
      ) : (
        <p className="empty">Klik tombol "Analisa Sekarang" untuk melihat hasil analisis.</p>
      )}
    </section>
  );
}
