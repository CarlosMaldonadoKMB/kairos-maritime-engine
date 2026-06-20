import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

export default function ExpedienteScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vesselData, setVesselData] = useState<any>(null);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // 🛡️ ESTADO CLAVE: El interruptor para Directemar
  const [modoInspeccion, setModoInspeccion] = useState(false);

  useEffect(() => {
    cargarDatosCompletos();
  }, []);

  const cargarDatosCompletos = async () => {
    try {
      const token = await AsyncStorage.getItem('kairos_token');
      if (!token) throw new Error("No hay token disponible");

      const decoded: any = jwtDecode(token);
      const miVesselId = decoded.assigned_vessel_id;

      if (!miVesselId) {
        setError("No tienes ninguna nave asignada.");
        setLoading(false);
        return;
      }

      // 1. Cargar Nave
      const resNaves = await fetch('https://kairos-maritime-backend.onrender.com/api/vessels', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataNaves = await resNaves.json();
      const miNave = dataNaves.find((v: any) => v.id === miVesselId) || dataNaves[0];
      if (miNave) setVesselData(miNave);

      // 2. Cargar Certificados
      const resCerts = await fetch('https://kairos-maritime-backend.onrender.com/api/certificates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resCerts.ok) {
        const dataCerts = await resCerts.json();
        const misCerts = dataCerts.filter((c: any) => c.vessel_id === miVesselId);
        misCerts.sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
        setCertificados(misCerts);
      }

    } catch (err: any) {
      setError("Error de conexión con el puerto central.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    cargarDatosCompletos();
  };

  const evaluarEstadoCertificado = (fechaVencimiento: string) => {
    const hoy = new Date();
    const vencimiento = new Date(fechaVencimiento);
    const diferenciaDias = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    if (diferenciaDias < 0) return { texto: 'Vencido', color: '#ef4444', icono: '🔴', aprobado: false };
    if (diferenciaDias <= 30) return { texto: `${diferenciaDias} días`, color: '#f59e0b', icono: '🟡', aprobado: true };
    return { texto: 'Vigente', color: '#10b981', icono: '🟢', aprobado: true };
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Cargando bitácora legal...</Text>
      </View>
    );
  }

  // Filtrar certificados si el Modo Inspección está activo (oculta los vencidos para no levantar alertas innecesarias)
  const certificadosAMostrar = modoInspeccion 
    ? certificados.filter(c => evaluarEstadoCertificado(c.expiry_date).aprobado)
    : certificados;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}>
      
      {/* CABECERA DINÁMICA DE ACUERDO AL MODO */}
      <View style={[styles.header, modoInspeccion && styles.headerInspeccion]}>
        <Text style={styles.title}>{modoInspeccion ? "🔒 INSPECCIÓN DIRECTEMAR" : "Expediente Digital"}</Text>
        <Text style={[styles.subtitle, modoInspeccion && { color: '#60a5fa' }]}>
          {modoInspeccion ? "Verificación de Cumplimiento Normativo" : "Historial de la Nave"}
        </Text>
      </View>

      {/* CONTROLADOR DEL MODO INSPECCIÓN */}
      <View style={styles.toggleCard}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.toggleTitle}>Modo Inspección Rápida</Text>
          <Text style={styles.toggleDesc}>Optimiza la lista para mostrar ante la autoridad marítima.</Text>
        </View>
        <Switch
          trackColor={{ false: '#334155', true: '#10b981' }}
          thumbColor={modoInspeccion ? '#fff' : '#94a3b8'}
          onValueChange={() => setModoInspeccion(!modoInspeccion)}
          value={modoInspeccion}
        />
      </View>

      {vesselData && (
        <>
          {/* INFO DE LA NAVE (Se simplifica en modo inspección) */}
          <View style={styles.vesselCard}>
            <Text style={styles.vesselName}>🚢 {vesselData.name || "Nave Asignada"}</Text>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.label}>N° IMO / Registro</Text>
              <Text style={styles.value}>{vesselData.imo_number || "En trámite"}</Text>
            </View>
            
            {/* Ocultamos datos internos del sistema si el inspector está mirando */}
            {!modoInspeccion && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>ID Sistema</Text>
                <Text style={styles.value}>#{vesselData.id?.substring(0, 8).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* LISTADO DE CERTIFICADOS */}
          <View style={styles.certSection}>
            <Text style={styles.sectionTitle}>
              {modoInspeccion ? "✅ Documentación Vigente Presentada" : "📋 Historial Completo de Documentos"}
            </Text>
            
            {certificadosAMostrar.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Sin registros que mostrar.</Text>
              </View>
            ) : (
              certificadosAMostrar.map((cert, index) => {
                const estado = evaluarEstadoCertificado(cert.expiry_date);
                return (
                  <View key={index} style={[styles.certCard, modoInspeccion && styles.certCardInspeccion]}>
                    <View style={styles.certInfo}>
                      <Text style={styles.certType}>{cert.type}</Text>
                      <Text style={styles.certDate}>Vence: {new Date(cert.expiry_date).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.certStatus}>
                      {modoInspeccion ? (
                        <View style={styles.badgeOficial}>
                          <Text style={styles.badgeOficialText}>✓ CERTIFICADO</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={{ fontSize: 16 }}>{estado.icono}</Text>
                          <Text style={[styles.statusLabel, { color: estado.color }]}>{estado.texto}</Text>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'white', marginTop: 15 },
  header: { padding: 30, paddingTop: 60, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', alignItems: 'center' },
  headerInspeccion: { backgroundColor: '#1e3a8a', borderBottomColor: '#3b82f6' }, // Azul oficial de autoridad
  title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  subtitle: { color: '#10b981', fontSize: 13, marginTop: 5, fontWeight: 'bold', textTransform: 'uppercase' },
  
  toggleCard: { flexDirection: 'row', backgroundColor: '#1e293b', margin: 20, marginBottom: 10, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  toggleTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  toggleDesc: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  vesselCard: { backgroundColor: '#1e293b', marginHorizontal: 20, marginTop: 10, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#334155' },
  vesselName: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { color: '#94a3b8', fontSize: 14 },
  value: { color: 'white', fontSize: 14, fontWeight: '600' },

  certSection: { paddingHorizontal: 20, marginTop: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#94a3b8', marginBottom: 12 },
  certCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  certCardInspeccion: { borderColor: '#2563eb', backgroundColor: '#132347' }, // Resalta en modo oficial
  certInfo: { flex: 1 },
  certType: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  certDate: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  certStatus: { alignItems: 'flex-end', marginLeft: 10 },
  statusLabel: { fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  
  badgeOficial: { backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1, borderColor: '#3b82f6' },
  badgeOficialText: { color: '#60a5fa', fontSize: 11, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 20, alignItems: 'center' },
  emptyText: { color: '#64748b' }
});