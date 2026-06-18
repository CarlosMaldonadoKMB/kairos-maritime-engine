"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { jwtDecode } from "jwt-decode";
// PDF EXPORTS
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Vessel {
  id: string;
  name: string;
  registration_number: string;
  count_vigente: number;
  count_peligro: number;
  count_vencido: number;
  count_tramite: number;
  total_certs: number;
}

export default function Dashboard() {
    const router = useRouter();
    
    // Estados de datos
    const [vessels, setVessels] = useState<Vessel[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [userRole, setUserRole] = useState<string | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null); // <--- ID de la naviera
  
    // Estados de UI / Modales
    const [showModal, setShowModal] = useState(false);
    const [newName, setNewName] = useState("");
    const [newReg, setNewReg] = useState("");
    const [submitting, setSubmitting] = useState(false);
  
    // Estados de Gestión de Tripulación
    const [showCrewModal, setShowCrewModal] = useState(false);
    const [newCrewEmail, setNewCrewEmail] = useState("");
    const [newCrewPassword, setNewCrewPassword] = useState("");
    const [newCrewVesselId, setNewCrewVesselId] = useState("");
    const [submittingCrew, setSubmittingCrew] = useState(false);
    
    // ... el resto de tus funciones (fetchVessels, handleCrearCapitan, etc)

  const fetchVessels = useCallback(async () => {
    const token = localStorage.getItem("kairos_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // 2. EXTRAEMOS EL ROL DE LA LLAVE AL CARGAR
    try {
      const decoded: any = jwtDecode(token);
      setUserRole(decoded.role);
    } catch (e) {
      console.error("Token corrupto");
    }

    try {
      const response = await fetch("https://kairos-maritime-backend.onrender.com/api/vessels", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setVessels(await response.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  const handleCrearNave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = localStorage.getItem("kairos_token");
    try {
      const res = await fetch("https://kairos-maritime-backend.onrender.com/api/vessels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName, registration_number: newReg }),
      });
      if (res.ok) {
        setShowModal(false);
        setNewName("");
        setNewReg("");
        fetchVessels();
      }
    } catch (err) {
      alert("Error al crear");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEliminar = async (id: string, name: string) => {
    if (
      !confirm(
        `¿Seguro que deseas eliminar la nave ${name}? Esta acción no se puede deshacer.`
      )
    )
      return;
    const token = localStorage.getItem("kairos_token");
    try {
      const res = await fetch(`https://kairos-maritime-backend.onrender.com/api/vessels/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchVessels();
    } catch (err) {
      alert("Error al eliminar");
    }
  };

  // --- FUNCIÓN PARA CREAR NUEVO CAPITÁN ---
  const handleCrearCapitan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCrew(true);
    const token = localStorage.getItem("kairos_token");
  
    try {
      const res = await fetch("https://kairos-maritime-backend.onrender.com/api/capitanes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newCrewEmail,
          password: newCrewPassword,
          tenant_id: tenantId, // <--- CAMBIADO A tenantId (el estado que definiste)
          assigned_vessel_id: newCrewVesselId,
        }),
      });
  
      if (res.ok) {
        setShowCrewModal(false);
        setNewCrewEmail("");
        setNewCrewPassword("");
        setNewCrewVesselId("");
        alert("¡Capitán creado correctamente!");
        fetchVessels(); // Refrescamos la lista si es necesario
      } else {
        const data = await res.json();
        alert(data?.error || "Error al crear capitán");
      }
    } catch (err) {
      alert("Error al conectar con el servidor");
    } finally {
      setSubmittingCrew(false);
    }
  };

  // NUEVO: FUNCIÓN PARA GENERAR EL REPORTE PDF
  const generarReportePDF = () => {
    const doc = new jsPDF();

    // Título corporativo
    doc.setFontSize(15);
    doc.setTextColor(22, 28, 43);
    doc.text("KAIROS MARITIME - REPORTE DE ESTADO DE FLOTA", 14, 20);

    // Fecha y hora
    const now = new Date();
    const fecha =
      now.toLocaleDateString() +
      " " +
      now
        .toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        .replace(/:/g, ":");
    doc.setFontSize(10);
    doc.setTextColor(120, 124, 140);
    doc.text(`Generado el: ${fecha}`, 14, 28);

    // Table headers
    const head = [
      [
        "Nave",
        "Matrícula",
        "Vigentes 🟢",
        "En Trámite 🔵",
        "Por Vencer 🟡",
        "Vencidos 🔴",
      ],
    ];

    // Table rows
    const rows = vessels.map((v) => [
      v.name,
      v.registration_number,
      v.count_vigente,
      v.count_tramite,
      v.count_peligro,
      v.count_vencido,
    ]);

    // Add table
    autoTable(doc, {
      head,
      body: rows,
      startY: 36,
      styles: { fontSize: 10 },
      headStyles: {
        fillColor: [41, 55, 106],
        textColor: 255,
        halign: "center",
        fontStyle: "bold",
      },
      bodyStyles: {
        halign: "center",
      },
      alternateRowStyles: { fillColor: [240, 245, 255] },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {},
    });

    // Save file
    doc.save("Reporte_Flota_Kairos.pdf");
  };

  // MÉTRICAS (Se calculan solas: si el Capitán solo recibe 1 nave, las métricas serán de esa nave)
  const globalStats = vessels.reduce(
    (acc, v) => ({
      vigente: acc.vigente + Number(v.count_vigente),
      peligro: acc.peligro + Number(v.count_peligro),
      vencido: acc.vencido + Number(v.count_vencido),
      tramite: acc.tramite + Number(v.count_tramite),
      total: acc.total + Number(v.total_certs),
    }),
    { vigente: 0, peligro: 0, vencido: 0, tramite: 0, total: 0 }
  );

  const porcentajeCumplimiento =
    globalStats.total === 0
      ? 100
      : Math.round(
          ((globalStats.vigente + globalStats.tramite) / globalStats.total) *
            100
        );

  const chartData = [
    { name: "Vigentes", value: globalStats.vigente, color: "#10b981" },
    { name: "En Trámite", value: globalStats.tramite, color: "#3b82f6" },
    { name: "Por Vencer", value: globalStats.peligro, color: "#f59e0b" },
    { name: "Vencidos", value: globalStats.vencido, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-800 uppercase">
              Kairos <span className="text-blue-600">Maritime</span>
            </h1>
            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">
              {userRole === "admin"
                ? "Intelligence Fleet Dashboard"
                : "Unidad Asignada / Panel de Control"}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {/* 3. SOLO ADMIN PUEDE VER LOS BOTONES DE REGISTRO Y NUEVO CAPITAN */}
            {userRole === "admin" && (
              <>
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg text-sm"
                >
                  + REGISTRAR NAVE
                </button>
                <button
                  onClick={() => setShowCrewModal(true)}
                  className="bg-white border-2 border-blue-600 text-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-all shadow text-sm"
                >
                  + NUEVO CAPITÁN
                </button>
              </>
            )}
            {/* PDF EXPORT button (visible for todos los roles) */}
            <button
              onClick={generarReportePDF}
              className="flex items-center gap-2 bg-white border border-slate-300 px-5 py-3 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all text-sm shadow"
              title="Exportar reporte PDF de auditoría de flota"
              type="button"
            >
              <span role="img" aria-label="Documento PDF" className="text-lg">
                📄
              </span>
              <span style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.03em" }}>
                Reporte PDF
              </span>
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("kairos_token");
                router.push("/login");
              }}
              className="bg-white text-slate-400 hover:text-red-500 font-bold px-4 py-3 rounded-xl border border-slate-200 transition-all text-sm"
            >
              SALIR
            </button>
          </div>
        </div>

        {/* INDICADORES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-center">
            <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1">
              Estado de Cumplimiento
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-slate-800">
                {globalStats.vigente + globalStats.tramite}
              </span>
              <span className="text-xl font-bold text-slate-400">
                / {globalStats.total}
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full mt-6 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-1000"
                style={{ width: `${porcentajeCumplimiento}%` }}
              ></div>
            </div>
            <p
              className={`mt-4 font-black text-lg ${
                porcentajeCumplimiento > 80
                  ? "text-emerald-500"
                  : "text-red-500"
              }`}
            >
              {porcentajeCumplimiento}% Operativo
            </p>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center">
            <div className="w-full md:w-1/2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    innerRadius={50}
                    outerRadius={65}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                <p className="text-xl font-black text-emerald-700">
                  {globalStats.vigente}
                </p>
                <p className="text-[8px] font-bold text-emerald-600 uppercase">
                  Vigentes
                </p>
              </div>
              <div
                className={`p-3 rounded-xl bg-blue-50 border border-blue-100 text-center ${
                  globalStats.tramite > 0 ? "animate-pulse" : ""
                }`}
              >
                <p className="text-xl font-black text-blue-700">
                  {globalStats.tramite}
                </p>
                <p className="text-[8px] font-bold text-blue-600 uppercase">
                  En Trámite
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                <p className="text-xl font-black text-amber-700">
                  {globalStats.peligro}
                </p>
                <p className="text-[8px] font-bold text-amber-600 uppercase">
                  Por Vencer
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
                <p className="text-xl font-black text-red-700">
                  {globalStats.vencido}
                </p>
                <p className="text-[8px] font-bold text-red-600 uppercase">
                  Vencidos
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* TABLA DE FLOTA */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-black text-slate-700 uppercase text-xs tracking-widest">
              {userRole === "admin"
                ? "Radar de Unidades"
                : "Detalle de Unidad"}
            </h3>
            {userRole === "admin" && (
              <input
                type="text"
                placeholder="Filtrar unidad..."
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-48"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            )}
          </div>
          <table className="w-full">
            <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="p-6 text-left">Nave</th>
                <th className="p-6 text-left">Estado de Salud</th>
                <th className="p-6 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vessels
                .filter((v) =>
                  v.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/50 transition-all"
                  >
                    <td className="p-6">
                      <div className="font-black text-slate-800 text-md">
                        {v.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase">
                        {v.registration_number}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex gap-1">
                        {Number(v.count_vencido) > 0 && (
                          <span className="bg-red-500 text-white px-2 py-1 rounded-md text-[10px] font-black">
                            🔴 {v.count_vencido}
                          </span>
                        )}
                        {Number(v.count_peligro) > 0 && (
                          <span className="bg-amber-500 text-white px-2 py-1 rounded-md text-[10px] font-black">
                            🟡 {v.count_peligro}
                          </span>
                        )}
                        {Number(v.count_vigente) > 0 && (
                          <span className="bg-emerald-500 text-white px-2 py-1 rounded-md text-[10px] font-black">
                            🟢 {v.count_vigente}
                          </span>
                        )}
                        {Number(v.count_tramite) > 0 && (
                          <span className="bg-blue-500 text-white px-2 py-1 rounded-md text-[10px] font-black animate-pulse">
                            🔵 {v.count_tramite}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-6 text-right flex justify-end items-center gap-4">
                      <Link
                        href={`/vessels/${v.id}`}
                        className="text-blue-600 font-black text-[10px] uppercase tracking-widest hover:underline"
                      >
                        {" "}
                        Abrir{" "}
                      </Link>

                      {/* 4. SOLO ADMIN PUEDE VER EL BOTÓN DE ELIMINAR */}
                      {userRole === "admin" && (
                        <button
                          onClick={() => handleEliminar(v.id, v.name)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            fill="currentColor"
                            viewBox="0 0 16 16"
                          >
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                            <path
                              fillRule="evenodd"
                              d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                            />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL ASTILLERO */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-4xl p-8 max-w-sm w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-slate-800">
              Alta de Unidad
            </h2>
            <form onSubmit={handleCrearNave} className="space-y-4">
              <input
                required
                type="text"
                placeholder="Nombre (Ej: MV Estrella)"
                className="w-full border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                required
                type="text"
                placeholder="Matrícula"
                className="w-full border border-slate-200 rounded-xl p-4 outline-none uppercase font-mono"
                value={newReg}
                onChange={(e) => setNewReg(e.target.value)}
              />
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-slate-400 font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl text-sm shadow-lg shadow-blue-200"
                >
                  {submitting ? "Cargando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR CAPITÁN */}
      {showCrewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-4xl p-8 max-w-sm w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-slate-800">
              Alta de Capitán
            </h2>
            <form onSubmit={handleCrearCapitan} className="space-y-4">
              <input
                required
                type="email"
                placeholder="Email del capitán"
                className="w-full border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500"
                value={newCrewEmail}
                onChange={(e) => setNewCrewEmail(e.target.value)}
                autoComplete="off"
              />
              <input
                required
                type="password"
                placeholder="Contraseña"
                className="w-full border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500"
                value={newCrewPassword}
                onChange={(e) => setNewCrewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <select
                required
                className="w-full border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 bg-white"
                value={newCrewVesselId}
                onChange={(e) => setNewCrewVesselId(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona una nave a asignar...
                </option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.registration_number})
                  </option>
                ))}
              </select>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCrewModal(false)}
                  className="flex-1 py-4 text-slate-400 font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingCrew}
                  className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl text-sm shadow-lg shadow-blue-200"
                >
                  {submittingCrew ? "Cargando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
  }