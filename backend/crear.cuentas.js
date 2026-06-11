// Archivo: crear_cuentas.js

async function iniciarOnboarding() {
    console.log("🚀 Enviando orden de creación al motor en Render...");
  
    const url = 'https://kairos-maritime-backend.onrender.com/api/onboarding';
    
    // Edita solo estas tres líneas con los datos de tu prospecto:
const datos = {
  naviera_name: "Naviera Lena",
  admin_email: "carlos.maldonado@kairosmb.org",
  admin_password: "demo2026" // Usa una clave fácil para la demostración
};
  
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
  
      const resultado = await respuesta.json();
  
      if (respuesta.ok) {
        console.log("🟢 ÉXITO:", resultado.message);
        console.log("=> Ya puedes usar el correo 'gerente@latitud41.cl' en tu base de datos.");
      } else {
        console.log("🔴 ERROR:", resultado.error);
      }
    } catch (error) {
      console.log("❌ Falla de conexión:", error);
    }
  }
  
  iniciarOnboarding();