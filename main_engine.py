import pandas as pd
from datetime import datetime, timedelta

def procesar_alertas():
    # 1. Cargar los datos (Simulación de lectura de Sheets)
    df = pd.read_excel('DB_Kairos_Maritime.xlsx', sheet_name='Registro_Certificaciones')
    
    hoy = datetime.now()
    limite_alerta = hoy + timedelta(days=30)

    # 2. Lógica de Negocio: Buscar certificados en riesgo
    # Filtramos los que vencen en menos de 30 días y están validados
    riesgos = df[(df['Fecha_Vencimiento'] <= limite_alerta) & (df['Estado_Validacion'] == 'Validado')]
    
    # 3. Lógica de Validación: Buscar fotos que no han sido reemplazadas por PDF
    pendientes = df[df['Estado_Validacion'] == 'Pendiente']

    print(f"--- REPORTE KAIROS ---")
    print(f"Certificados en riesgo de vencimiento: {len(riesgos)}")
    print(f"Fotos pendientes de validación oficial: {len(pendientes)}")
    
    return riesgos, pendientes

if __name__ == "__main__":
    procesar_alertas()