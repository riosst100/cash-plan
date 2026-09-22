import { useState } from "react";
import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
import { Landmark, CreditCard, Receipt, Wallet, PiggyBank, BarChart3, Sparkles, Search } from "lucide-react";
import { api } from "./api.js";
import { useAppData } from "./useAppData.js";
import PlatformPage from "./pages/PlatformPage.jsx";
import LoanPage from "./pages/LoanPage.jsx";
import ExpensePage from "./pages/ExpensePage.jsx";
import IncomePage from "./pages/IncomePage.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";
import AnalysisPage from "./pages/AnalysisPage.jsx";
import SaldoPage from "./pages/SaldoPage.jsx";

const TABS = [
  { path: "/platform", label: "Platform", icon: Landmark },
  { path: "/loan", label: "Loan", icon: CreditCard },
  { path: "/expenses", label: "Pengeluaran", icon: Receipt },
  { path: "/income", label: "Gaji / Pemasukan", icon: Wallet },
  { path: "/saldo", label: "Saldo", icon: PiggyBank },
  { path: "/summary", label: "Summary", icon: BarChart3 },
  { path: "/analysis", label: "Analisa", icon: Sparkles },
];

export default function App() {
  const data = useAppData();
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const navigate = useNavigate();

  async function handleAnalyze() {
    setAnalyzing(true);
    data.setError("");
    try {
      const res = await api.analyze();
      setResult(res);
      navigate("/analysis");
    } catch (err) {
      data.setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1><Wallet size={24} style={{ verticalAlign: "-4px", marginRight: 8 }} /> Cash Plan</h1>
        <p>Analisis kredit &amp; jalan keluar bebas dari pinjol / paylater</p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink key={t.path} to={t.path} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon size={15} /> {t.label}
              </span>
            </NavLink>
          );
        })}
        <button className="btn-analyze" onClick={handleAnalyze} disabled={analyzing}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Search size={15} /> {analyzing ? "Menganalisa..." : "Analisa Sekarang"}
          </span>
        </button>
      </nav>

      {data.error && <div className="alert-box warn">{data.error}</div>}

      <main>
        <Routes>
          <Route path="/" element={<PlatformPage platforms={data.platforms} loadAll={data.loadAll} />} />
          <Route path="/platform" element={<PlatformPage platforms={data.platforms} loadAll={data.loadAll} />} />
          <Route
            path="/loan"
            element={
              <LoanPage
                platforms={data.platforms}
                debts={data.debts}
                showPaidDebts={data.showPaidDebts}
                setShowPaidDebts={data.setShowPaidDebts}
                loadAll={data.loadAll}
                setError={data.setError}
              />
            }
          />
          <Route path="/expenses" element={<ExpensePage expenses={data.expenses} balances={data.balances} loadAll={data.loadAll} />} />
          <Route path="/income" element={<IncomePage incomes={data.incomes} balances={data.balances} loadAll={data.loadAll} />} />
          <Route path="/saldo" element={<SaldoPage balances={data.balances} loadAll={data.loadAll} />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/analysis" element={<AnalysisPage result={result} />} />
        </Routes>
      </main>
    </div>
  );
}
