import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

export default function MiNaveScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vesselData, setVesselData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarMiNave();
  }, []);

  const cargarMiNave = async () => {
    try {
      const token = await AsyncStorage.getItem('kairos_token');
      if (!token) throw new Error("No hay token disponible");

      // 1. Descubrimos qué nave le pertenece al capitán
      const decoded: any = jwtDecode(token);
      const miVesselId = decoded.assigned_vessel_id;

      if (!miVesselId) {
        setError("No tienes ninguna nave asignada en el sistema.");
        setLoading(false);
        return;
      }

      // 2. Buscamos los datos de ESA nave en el backend
      const response = await fetch('https://kairos-maritime-backend.onrender.com/api/vessels', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error("Error al consultar el servidor");

      const data = await response.json();
      
      // Como el backend devuelve un arreglo (y el capitán solo debería recibir la suya), la extraemos:
      const miNave = data.find((v: any) => v.id === miVesselId) || data[0];
      
      if (miNave) {
        setVesselData(miNave);
      } else {
        setError("Tu nave asignada no se encuentra en los registros.");
      }

    } catch (err: any) {
      setError(err.message || "Error de conexión con el puerto central.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    cargarMiNave();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Conectando con el radar de la flota...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>⚓ Mi Nave</Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : vesselData ? (
        <View style={styles.vesselCard}>
          <Text style={styles.vesselName}>{vesselData.name || "Nave Desconocida"}</Text>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>N° IMO:</Text>
            <Text style={styles.value}>{vesselData.imo_number || "N/A"}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>ID de Sistema:</Text>
            <Text style={styles.value}>{vesselData.id}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Estado:</Text>
            <Text style={[styles.value, { color: '#10b981', fontWeight: 'bold' }]}>Operativa</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.hintText}>
        Desliza hacia abajo para actualizar los datos desde el servidor central.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'white', marginTop: 15, fontSize: 16 },
  header: { padding: 30, paddingTop: 60, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center' },
  vesselCard: { backgroundColor: '#1e293b', margin: 20, borderRadius: 15, padding: 20, elevation: 5, borderWidth: 1, borderColor: '#334155' },
  vesselName: { fontSize: 24, fontWeight: 'bold', color: '#10b981', textAlign: 'center', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  label: { color: '#94a3b8', fontSize: 16 },
  value: { color: 'white', fontSize: 16, fontWeight: '500' },
  errorCard: { backgroundColor: '#ef4444', margin: 20, borderRadius: 10, padding: 15 },
  errorText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
  hintText: { color: '#64748b', textAlign: 'center', marginTop: 20, fontSize: 13, paddingHorizontal: 20 }
});