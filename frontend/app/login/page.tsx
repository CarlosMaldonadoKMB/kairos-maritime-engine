"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 📡 Conectando con la sala de máquinas en Render
      const response = await fetch("https://kairos-maritime-backend.onrender.com/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // Si el backend lanza un error, capturamos el texto real
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Credenciales incorrectas. Acceso denegado.");
      }

      const data = await response.json();
      
      // 🔐 LA CAJA FUERTE: Guardamos el token y el rol en el navegador
      localStorage.setItem("kairos_token", data.token);
      localStorage.setItem("kairos_role", data.role);
      
      // 🧠 EL CEREBRO ENRUTADOR (Direccionamiento Táctico)
      if (data.role === "superadmin") {
        router.push("/superadmin"); // Tu Centro de Mando
      } else if (data.role === "admin") {
        router.push("/dashboard");  // El Panel de Makarena
      } else if (data.role === "capitan") {
        // 🚫 Bloqueo táctico: El capitán no puede usar la web
        localStorage.removeItem("kairos_token"); 
        localStorage.removeItem("kairos_role");
        throw new Error("⚓ Acceso restringido. Los Capitanes deben operar exclusivamente desde la Aplicación Móvil.");
      } else {
        throw new Error("Rango desconocido en el sistema.");
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⚓</div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Kairos Engine</h1>
          <p className="text-blue-200 font-medium mt-1">Acceso Operativo B2B</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm font-bold border border-red-200 text-center">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Correo Corporativo</label>
              <input 
                type="email" required
                className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="ejemplo@naviera.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Contraseña</label>
              <input 
                type="password" required
                className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit" disabled={loading}
              className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-all disabled:bg-slate-400"
            >
              {loading ? "Verificando credenciales..." : "Iniciar Sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}