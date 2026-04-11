"use client";
import { useState } from "react";
import Link from "next/link";

export default function SuperAdminPage() {
  const [navieraName, setNavieraName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCrearCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    try {
      const response = await fetch("https://kairos-maritime-backend.onrender.com/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naviera_name: navieraName,
          admin_email: adminEmail,
          admin_password: adminPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMsg({ type: 'success', text: data.message });
        setNavieraName(""); setAdminEmail(""); setAdminPassword("");
      } else {
        throw new Error(data.error || "Error al desplegar infraestructura");
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm font-bold">
            ← Volver al inicio
          </Link>
          <h1 className="text-4xl font-black text-white mt-4 tracking-tight flex items-center gap-3">
            <span className="text-emerald-400">⚡</span> Centro de Mando (Super Admin)
          </h1>
          <p className="text-slate-400 mt-2 font-medium">Despliegue de infraestructura para nuevos clientes SaaS.</p>
        </div>

        <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-4">
            Registrar Nueva Naviera
          </h2>

          {statusMsg && (
            <div className={`p-4 rounded-xl mb-6 font-bold ${statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={handleCrearCliente} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2">Nombre Comercial de la Empresa</label>
              <input 
                required type="text" placeholder="Ej: Naviera Austral S.A."
                className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
                value={navieraName} onChange={(e) => setNavieraName(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Correo del Gerente (Admin)</label>
                <input 
                  required type="email" placeholder="gerente@empresa.com"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
                  value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Contraseña Inicial</label>
                <input 
                  required type="password" placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
                  value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" disabled={loading}
              className="w-full bg-emerald-500 text-slate-900 font-black py-4 rounded-xl hover:bg-emerald-400 transition-all disabled:bg-slate-600 disabled:text-slate-400 mt-4 shadow-lg shadow-emerald-500/20"
            >
              {loading ? "Desplegando infraestructura..." : "🚀 Desplegar Nuevo Cliente"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}