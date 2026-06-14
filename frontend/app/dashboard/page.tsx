"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Certificado {
  id: number;
  name: string;
  expiration_date: string;
  status: 'vigente' | 'por_vencer' | 'vencido' | 'en_tramite';
  days_remaining?: number;
}

interface Nave {
  id: number;
  name: string;
  registration_number: string;
  certificates: Certificado[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [authCargada, setAuthCargada] = useState(false);
  
  const [naves, setNaves] = useState<Nave[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [errorRadar, setErrorRadar] = useState("");

  // 🛠️ Estados para el Modal de Nueva Nave
  const [mostrarModalNave, setMostrarModalNave] = useState(false);
  const [nuevaNaveNombre, setNuevaNaveNombre] = useState("");
  const [nuevaNaveMatricula, setNuevaNaveMatricula] = useState("");
  const [guardandoNave, setGuardandoNave] = useState(false);

  // 📄 Estados para el Modal de Nuevo Certificado
  const [mostrarModalCert, setMostrarModalCert] = useState(false);
  const [naveSeleccionada, setNaveSeleccionada] = useState<number | null>(null);
  const [nuevoCertNombre, setNuevoCertNombre] = useState("");
  const [nuevoCertFecha, setNuevoCertFecha] = useState("");
  const [guardandoCert, setGuardandoCert] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("kairos_token");
    const role = localStorage.getItem("kairos_role");

    if (!token || role !== "admin") {
      router.push("/login");
      return;
    }
    setAuthCargada(true);
    escanearFlota(token);
  }, [router]);

  const escanearFlota = async (token: string) => {
    try {
      const response = await fetch("https://kairos-maritime-backend.onrender.com/api/vessels", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) throw new Error("Interferencia al escanear la flota.");
      
      const data = await response.json();
      setNaves(data);
    } catch (err: any) {
      setErrorRadar(err.message);
    } finally {
      setCargandoDatos(false);
    }
  };

  const handleCrearNave = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoNave(true);
    const token = localStorage.getItem("kairos_token");

    try {
      const response = await fetch("https://kairos-maritime-backend.onrender.com/api/vessels", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: nuevaNaveNombre, registration_number: nuevaNaveMatricula })
      });

      if (!response.ok) throw new Error("Fallo al registrar la nave en el astillero.");

      setMostrarModalNave(false);
      setNuevaNaveNombre("");
      setNuevaNaveMatricula("");
      escanearFlota(token!);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGuardandoNave(false);
    }
  };

  // 🚀 Función para enviar el certificado a la base de datos
 // 🚀 Función para enviar el certificado a la base de datos
 const handleCrearCertificado = async (e: React.FormEvent) => {
  e.preventDefault();
  setGuardandoCert(true);
  const token = localStorage.getItem("kairos_token");

  try {
    const response = await fetch("https://kairos-maritime-backend.onrender.com/api/certificates", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        vessel_id: naveSeleccionada,
        type: nuevoCertNombre,      // 👈 CORREGIDO: Neon espera 'type'
        expiry_date: nuevoCertFecha // 👈 CORREGIDO: Neon espera 'expiry_date'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Fallo al registrar el documento.");
    }

    setMostrarModalCert(false);
    setNuevoCertNombre("");
    setNuevoCertFecha("");
    escanearFlota(token!);
  } catch (err: any) {
    alert("Error del servidor: " + err.message);
  } finally {
    setGuardandoCert(false);
  }
};

  const abrirModalCert = (naveId: number) => {
    setNaveSeleccionada(naveId);
    setMostrarModalCert(true);
  };

  const cerrarSesion = () => {
    localStorage.removeItem("kairos_token");
    localStorage.removeItem("kairos_role");
    router.push("/login");
  };

  if (!authCargada || cargandoDatos) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500 font-bold gap-4">
        <span className="text-4xl animate-pulse">📡</span>
        <p>Escaneando radares de la flota...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚓</span>
              <span className="font-extrabold tracking-tight text-xl">Kairos Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-blue-200">Panel de Armador (Demo)</span>
              <button onClick={cerrarSesion} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Estado de la Flota</h1>
          <button onClick={() => setMostrarModalNave(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-all flex items-center gap-2">
            <span>+</span> Añadir Nueva Nave
          </button>
        </div>

        {errorRadar && <div className="bg-red-100 border border-red-300 text-red-700 p-4 rounded-xl mb-6 font-bold">{errorRadar}</div>}

        {naves.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <span className="text-6xl mb-4 grayscale opacity-50">🛳️</span>
            <h2 className="text-2xl font-bold text-slate-700 mb-2">Tu radar está limpio</h2>
            <p className="text-slate-500 max-w-md mb-6">Aún no tienes naves registradas en el sistema. Añade tu primera embarcación para comenzar a monitorear los semáforos.</p>
            <button onClick={() => setMostrarModalNave(true)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl shadow transition-all">
              Comenzar a Registrar Flota
            </button>
          </div>
        ) : (
          naves.map((nave) => (
            <div key={nave.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⛴️</span>
                  <h2 className="text-xl font-bold text-white">Nave "{nave.name}"</h2>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1 rounded-full border border-slate-600">
                    Matrícula: {nave.registration_number}
                  </span>
                  <button onClick={() => abrirModalCert(nave.id)} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1 rounded-lg transition-colors">
                    + Documento
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                {nave.certificates && nave.certificates.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {nave.certificates.map(cert => (
                      <div key={cert.id} className={`border rounded-xl p-5 flex flex-col justify-between ${
                        cert.status === 'por_vencer' ? 'border-amber-200 bg-amber-50' :
                        cert.status === 'vencido' ? 'border-red-200 bg-red-50' : 'border-slate-200'
                      }`}>
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-slate-700">{cert.name}</h3>
                            <span className={`text-xs font-bold px-2 py-1 rounded flex items-center gap-1 ${
                              cert.status === 'vigente' ? 'bg-emerald-100 text-emerald-700' :
                              cert.status === 'por_vencer' ? 'bg-amber-200 text-amber-800' :
                              'bg-red-200 text-red-800'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${
                                cert.status === 'vigente' ? 'bg-emerald-500' :
                                cert.status === 'por_vencer' ? 'bg-amber-500 animate-ping' :
                                'bg-red-500'
                              }`}></span>
                              {cert.status === 'vigente' ? 'Vigente' : cert.status === 'por_vencer' ? 'Por Vencer' : 'Vencido'}
                            </span>
                          </div>
                          <p className={`text-sm font-bold ${cert.status === 'por_vencer' ? 'text-amber-600' : cert.status === 'vencido' ? 'text-red-600' : 'text-slate-500'}`}>
                            Vence: {new Date(cert.expiration_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <p className="text-slate-500 text-sm font-medium">No hay certificados registrados para esta nave todavía.</p>
                    <button onClick={() => abrirModalCert(nave.id)} className="text-blue-600 font-bold hover:text-blue-800 text-sm transition-colors border border-blue-200 bg-blue-50 px-4 py-2 rounded-lg">
                      + Cargar Primer Certificado
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </main>

      {/* ⬛ MODAL DE CREACIÓN DE NAVE (Oculto en resumen por brevedad, mantener el tuyo) */}
      {mostrarModalNave && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">Registrar Nueva Nave</h3>
              <button onClick={() => setMostrarModalNave(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
            </div>
            <form onSubmit={handleCrearNave} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre de la Nave</label>
                <input type="text" required placeholder="Ej: Lena 1" className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" value={nuevaNaveNombre} onChange={(e) => setNuevaNaveNombre(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Número de Matrícula</label>
                <input type="text" required placeholder="Ej: PM-1234" className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" value={nuevaNaveMatricula} onChange={(e) => setNuevaNaveMatricula(e.target.value)} />
              </div>
              <button type="submit" disabled={guardandoNave} className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-400 transition-all mt-4 disabled:bg-slate-400">
                {guardandoNave ? "Registrando..." : "Guardar Nave"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 📄 MODAL DE CREACIÓN DE CERTIFICADO */}
      {mostrarModalCert && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">Cargar Documento</h3>
              <button onClick={() => setMostrarModalCert(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
            </div>
            <form onSubmit={handleCrearCertificado} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Certificado</label>
                <input type="text" required placeholder="Ej: Certificado Médico STCW" className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" value={nuevoCertNombre} onChange={(e) => setNuevoCertNombre(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Fecha de Vencimiento</label>
                <input type="date" required className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" value={nuevoCertFecha} onChange={(e) => setNuevoCertFecha(e.target.value)} />
              </div>
              <button type="submit" disabled={guardandoCert} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition-all mt-4 disabled:bg-slate-400">
                {guardandoCert ? "Procesando..." : "Guardar Certificado"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}