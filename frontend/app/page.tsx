"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // 🧠 El Cerebro Enrutador Raíz
    const token = localStorage.getItem("kairos_token");
    
    // Le damos un pequeñísimo respiro de 1 segundo para que el usuario 
    // alcance a ver el logo antes de ser redirigido
    const timer = setTimeout(() => {
      if (token) {
        router.push("/dashboard"); // Tiene llaves -> Al panel
      } else {
        router.push("/login"); // No tiene llaves -> A la puerta de embarque
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center font-sans">
      <div className="flex flex-col items-center animate-pulse">
        <span className="text-6xl mb-4 text-blue-600">⚓</span>
        <h1 className="text-3xl font-black tracking-tight text-slate-800 uppercase">
          Kairos <span className="text-blue-600">Maritime</span>
        </h1>
        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-3">
          Calentando motores...
        </p>
      </div>
    </div>
  );
}