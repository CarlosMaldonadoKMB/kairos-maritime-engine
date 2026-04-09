"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Certificate {
  id: string;
  type: string;
  expiry_date: string;
  status: string;
  file_url?: string;
}

export default function VesselDetail() {
  const params = useParams();
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Estados para el nuevo certificado
  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  // Función auxiliar para obtener la llave de la caja fuerte
  const getToken = () => {
    const token = localStorage.getItem("kairos_token");
    if (!token) {
      router.push("/login");
      return null;
    }
    return token;
  };

  const fetchCertificates = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch(`http://localhost:3001/api/vessels/${params.id}/certificates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("kairos_token");
        router.push("/login");
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        setCertificates(data);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCertificates(); }, [params.id, router]);

  // LA DOBLE BARRERA: Validación de fecha y subida a AWS
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    
    const fechaSeleccionada = new Date(fecha);
    const hoy = new Date();
    const limiteFuturo = new Date();
    limiteFuturo.setFullYear(hoy.getFullYear() + 10);
    const limitePasado = new Date();
    limitePasado.setFullYear(hoy.getFullYear() - 5);

    if (fechaSeleccionada > limiteFuturo || fechaSeleccionada < limitePasado) {
      alert("⚠️ Error: La fecha debe estar entre los últimos 5 años y los próximos 10 años.");
      return;
    }

    if (!archivo) {
      alert("⚠️ Por favor, selecciona un documento.");
      return;
    }

    setSubiendo(true);
    const formData = new FormData();
    formData.append("vessel_id", params.id as string);
    formData.append("type", tipo);
    formData.append("expiry_date", fecha);
    formData.append("file", archivo);

    try {
      const response = await fetch("http://localhost:3001/api/certificates", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData 
      });

      if (response.ok) {
        setShowModal(false);
        setTipo(""); setFecha(""); setArchivo(null);
        fetchCertificates(); 
      } else {
        alert("❌ Error al guardar el certificado.");
      }
    } catch (err) {
      alert("❌ Error al conectar con el servidor.");
    } finally {
      setSubiendo(false);
    }
  };

  // ACCIÓN TÁCTICA: Renovación a un clic (Redis + Cambio a Azul)
  const handleRenovar = async (certId: string) => {
    const token = getToken();
    if (!token) return;

    if (!confirm("¿Deseas enviar una solicitud de inspección oficial a la Autoridad Marítima?")) return;

    try {
      const response = await fetch(`http://localhost:3001/api/certificates/${certId}/renew`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        fetchCertificates(); 
      }
    } catch (err) {
      alert("❌ Error de comunicación con el servidor.");
    }
  };

  // SISTEMA DE ETIQUETAS VISUALES
  const getStatusBadge = (status: string) => {
    if (status.includes("🔴")) return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-black border border-red-200 uppercase tracking-wide">{status}</span>;
    if (status.includes("🟡")) return <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-black border border-amber-200 uppercase tracking-wide">{status}</span>;
    if (status.includes("🔵")) return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-black border border-blue-200 uppercase tracking-wide animate-pulse">{status}</span>;
    return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black border border-emerald-200 uppercase tracking-wide">{status}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* NAVEGACIÓN Y ACCIONES */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <Link href="/" className="text-slate-500 font-bold hover:text-blue-600 transition-colors flex items-center gap-2">
            <span>←</span> Volver a la Flota
          </Link>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
          >
            <span>📄</span> + Nuevo Certificado
          </button>
        </div>

        <h1 className="text-3xl font-extrabold text-slate-800 mb-8 tracking-tight">Expediente Digital</h1>

        {/* LISTADO DE CERTIFICADOS */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin text-blue-600 text-4xl mb-4">⚙️</div>
            <p className="text-slate-500 font-medium">Cargando expediente de la nave...</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-slate-200 border-dashed">
            <span className="text-5xl block mb-4">📂</span>
            <h3 className="text-xl font-bold text-slate-700 mb-2">Expediente Vacío</h3>
            <p className="text-slate-500">No hay documentos registrados para esta nave aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {certificates.map((cert) => (
              <div key={cert.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{cert.type}</h3>
                    {getStatusBadge(cert.status)}
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg mb-6 border border-slate-100">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Fecha de Vencimiento</p>
                    <p className="font-mono font-bold text-slate-700">
                      {new Date(cert.expiry_date).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {cert.file_url ? (
                    <a 
                      href={cert.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex justify-center items-center gap-2 w-full bg-slate-800 text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-700 transition-colors"
                    >
                      <span>🔒</span> Ver Documento (S3)
                    </a>
                  ) : (
                    <div className="flex justify-center items-center gap-2 w-full bg-slate-100 text-slate-400 py-3 rounded-xl text-sm font-bold cursor-not-allowed">
                      <span>🚫</span> Sin Archivo Adjunto
                    </div>
                  )}

                  {/* EL BOTÓN TÁCTICO DE RENOVACIÓN */}
                  {(cert.status.includes("🟡") || cert.status.includes("🔴")) && (
                    <button
                      onClick={() => handleRenovar(cert.id)}
                      className="w-full flex justify-center items-center gap-2 bg-linear-to-r from-amber-500 to-orange-600 text-white py-3 rounded-xl text-sm font-bold hover:from-amber-600 hover:to-orange-700 shadow-md transition-all"
                    >
                      <span>📋</span> Solicitar Inspección
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DEL FORMULARIO */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
              <h2 className="text-2xl font-extrabold mb-6 text-slate-800">Registrar Certificado</h2>
              <form onSubmit={handleGuardar} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Tipo de Certificado</label>
                  <input 
                    required type="text" placeholder="Ej: Navegabilidad, Radio, etc."
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={tipo} onChange={(e) => setTipo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Vencimiento</label>
                  <input 
                    required type="date" 
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={fecha} onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Documento de Respaldo</label>
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                    <input 
                      required type="file" accept="image/*,application/pdf"
                      className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      onChange={(e) => setArchivo(e.target.files ? e.target.files[0] : null)}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button" onClick={() => setShowModal(false)}
                    className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" disabled={subiendo}
                    className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-slate-300 transition-all flex justify-center items-center gap-2"
                  >
                    {subiendo ? "Subiendo..." : "Guardar Registro"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}