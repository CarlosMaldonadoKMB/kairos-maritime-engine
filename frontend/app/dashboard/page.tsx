"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const [authCargada, setAuthCargada] = useState(false);

  // 🛡️ Guardia de Seguridad del Panel
  useEffect(() => {
    const token = localStorage.getItem("kairos_token");
    const role = localStorage.getItem("kairos_role");

    // Si no hay token o trata de entrar un Capitán o un SuperAdmin por error, lo echamos al login
    if (!token || role !== "admin") {
      router.push("/login");
    } else {
      setAuthCargada(true);
    }
  }, [router]);

  const cerrarSesion = () => {
    localStorage.removeItem("kairos_token");
    localStorage.removeItem("kairos_role");
    router.push("/login");
  };

  if (!authCargada) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center font-bold text-slate-500">Cargando radares...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* 🔵 NAVBAR SUPERIOR */}
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚓</span>
              <span className="font-extrabold tracking-tight text-xl">Kairos Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-blue-200">Panel de Armador (Demo)</span>
              <button 
                onClick={cerrarSesion}
                className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 📊 CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Estado de la Flota</h1>
          <button className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-all">
            + Añadir Nueva Nave
          </button>
        </div>

        {/* 🚢 TARJETA DE NAVE (MOCKUP VISUAL) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⛴️</span>
              <h2 className="text-xl font-bold text-white">Motor Nave "Lena 1"</h2>
            </div>
            <span className="bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1 rounded-full border border-slate-600">
              ID: 8A9B-4C2D
            </span>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* CERTIFICADO 1: VIGENTE */}
              <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-700">Certificado Médico STCW</h3>
                    <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Vigente
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">Vence: 12 Noviembre 2027</p>
                </div>
              </div>

              {/* CERTIFICADO 2: ALERTA AMARILLA */}
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800">Inspección de Balsas</h3>
                    <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 hover:animate-ping"></span> Por Vencer
                    </span>
                  </div>
                  <p className="text-sm font-bold text-amber-600">Vence en: 14 Días</p>
                </div>
                
                {/* 🚨 EL BOTÓN MÁGICO DE DIRECTEMAR */}
                <button className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2 rounded-lg shadow transition-all flex justify-center items-center gap-2">
                  <span>📨</span> Solicitar Inspección
                </button>
              </div>

              {/* CERTIFICADO 3: EN TRÁMITE */}
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-700">Radio y Comunicaciones</h3>
                    <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> En Trámite
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">Esperando revisión de la Armada</p>
                </div>
                <button className="mt-4 w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-sm font-bold py-2 rounded-lg transition-all">
                  Ver Solicitud
                </button>
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>
  );
}