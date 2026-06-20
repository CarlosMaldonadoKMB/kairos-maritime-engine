import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { jwtDecode } from 'jwt-decode';

export default function RadarScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vesselData, setVesselData] = useState<any>(null);
  const [certStats, setCertStats] = useState({ total: 0, vencidos: 0, porVencer: 0, vigentes: 0 });
  const [offlineDocs, setOfflineDocs] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarRadar();
  }, []);

  const cargarRadar = async () => {
    try {
      const token = await AsyncStorage.getItem('kairos_token');
      if (!token) throw new Error("No hay credenciales activas");

      const decoded: any = jwtDecode(token);
      const miVesselId = decoded.assigned_vessel_id;

      // 1. Cargar Bodega Offline
      const guardados = await AsyncStorage.getItem('@bodega_kairos');
      if (guardados) setOfflineDocs(JSON.parse(guardados));

      if (!miVesselId) {
        setError("Sin nave asignada.");
        setLoading(false);
        return;
      }

      // 2. Cargar Nave
      const resNaves = await fetch('https://kairos-maritime-backend.onrender.com/api/vessels', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataNaves = await resNaves.json();
      const miNave = dataNaves.find((v: any) => v.id === miVesselId) || dataNaves[0];
      if (miNave) setVesselData(miNave);

      // 3. Analizar Certificados para el Semáforo
      const resCerts = await fetch('https://kairos-maritime-backend.onrender.com/api/certificates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (resCerts.ok) {
        const dataCerts = await resCerts.json();
        const misCerts = dataCerts.filter((c: any) => c.vessel_id === miVesselId);
        
        let vencidos = 0; let porVencer = 0; let vigentes = 0;
        const hoy = new Date().getTime();

        misCerts.forEach((cert: any) => {
          const vencimiento = new Date(cert.expiry_date).getTime();
          const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
          
          if (diasRestantes < 0) vencidos++;
          else if (diasRestantes <= 30) porVencer++;
          else vigentes++;
        });

        setCertStats({ total: misCerts.length, vencidos, porVencer, vigentes });
      }

    } catch (err: any) {
      setError("Fallo de conexión. Operando en modo offline.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    cargarRadar();
  };

  // 🚀 Lógica de Sincronización VIP
  const sincronizarBodega = async () => {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      Alert.alert("Sin Señal", "Aún no hay conexión a internet para sincronizar.");
      return;
    }

    setSyncing(true);
    try {
      const token = await AsyncStorage.getItem('kairos_token');
      let enviados = 0;

      for (const paquete of offlineDocs) {
        const formData = new FormData();
        formData.append('vessel_id', paquete.vesselId);
        formData.append('type', paquete.certType);
        formData.append('expiry_date', paquete.expiryDate);
        formData.append('file', { uri: paquete.uri, name: `cert_${paquete.id}.jpg`, type: 'image/jpeg' } as any);

        const res = await fetch('https://kairos-maritime-backend.onrender.com/api/certificates', {
          method: 'POST',
          body: formData,
          headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) enviados++;
      }

      await AsyncStorage.removeItem('@bodega_kairos');
      setOfflineDocs([]);
      Alert.alert("Sincronización Exitosa", `Se subieron ${enviados} documentos a la nube.`);
      cargarRadar();
    } catch (e) {
      Alert.alert("Error", "La sincronización falló parcialmente.");
    } finally {
      setSyncing(false);
    }
  };

  // 🚦 Determinar el estado del Semáforo
  let zarpeStatus = { texto: "ZARPE AUTORIZADO", color: "#10b981", bgColor: "rgba(16, 185, 129, 0.15)", icono: "✅" };
  if (certStats.porVencer > 0) zarpeStatus = { texto: "ZARPE CON PRECAUCIÓN", color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.15)", icono: "⚠️" };
  if (certStats.vencidos > 0) zarpeStatus = { texto: "ZARPE DENEGADO", color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.15)", icono: "⛔" };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Iniciando radar...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}>
      
      {/* CABECERA */}
      <View style={styles.header}>
        <Text style={styles.headerGreeting}>Comandante</Text>
        <Text style={styles.headerVessel}>{vesselData ? vesselData.name : "Nave en tránsito"}</Text>
      </View>

      {/* 🚦 SEMÁFORO DE ZARPE (CHECKLIST PRINCIPAL) */}
      <View style={styles.paddingH}>
        <View style={[styles.semaforoCard, { borderColor: zarpeStatus.color, backgroundColor: zarpeStatus.bgColor }]}>
          <Text style={{ fontSize: 32, marginBottom: 5 }}>{zarpeStatus.icono}</Text>
          <Text style={[styles.semaforoText, { color: zarpeStatus.color }]}>{zarpeStatus.texto}</Text>
          <Text style={styles.semaforoSubtext}>
            {certStats.vencidos > 0 ? `Tienes ${certStats.vencidos} documento(s) vencido(s). Regulariza antes de zarpar.` : 
             certStats.porVencer > 0 ? `Tienes ${certStats.porVencer} documento(s) próximo(s) a vencer.` : 
             "Todos los documentos se encuentran en regla. Buen viaje."}
          </Text>
        </View>

        {/* 📊 RESUMEN NUMÉRICO */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#10b981' }]}>{certStats.vigentes}</Text>
            <Text style={styles.statLabel}>Vigentes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#f59e0b' }]}>{certStats.porVencer}</Text>
            <Text style={styles.statLabel}>Por Vencer</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#ef4444' }]}>{certStats.vencidos}</Text>
            <Text style={styles.statLabel}>Vencidos</Text>
          </View>
        </View>

        {/* ☁️ COLA OFFLINE VIP (Solo aparece si hay documentos sin subir) */}
        {offlineDocs.length > 0 && (
          <View style={styles.offlineCard}>
            <View style={styles.offlineHeader}>
              <Text style={styles.offlineTitle}>📡 Nube Sincronización</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{offlineDocs.length}</Text></View>
            </View>
            <Text style={styles.offlineDesc}>Tienes documentos capturados en altamar esperando ser enviados a la central.</Text>
            <TouchableOpacity style={styles.syncBtn} onPress={sincronizarBodega} disabled={syncing}>
              {syncing ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.syncBtnText}>⬆️ SINCRONIZAR AHORA</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#cbd5e1', marginTop: 15 },
  paddingH: { paddingHorizontal: 20 },
  
  header: { padding: 30, paddingTop: 60, paddingBottom: 20 },
  headerGreeting: { color: '#94a3b8', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 },
  headerVessel: { color: 'white', fontSize: 28, fontWeight: 'bold' },

  semaforoCard: { padding: 25, borderRadius: 16, borderWidth: 2, alignItems: 'center', marginBottom: 20 },
  semaforoText: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 5 },
  semaforoSubtext: { color: '#cbd5e1', textAlign: 'center', fontSize: 14 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  statBox: { flex: 1, backgroundColor: '#1e293b', padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#334155' },
  statNum: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },

  offlineCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#3b82f6', borderStyle: 'dashed' },
  offlineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  offlineTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  badge: { backgroundColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  offlineDesc: { color: '#94a3b8', fontSize: 14, marginBottom: 15 },
  syncBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' },
  syncBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 14 }
});