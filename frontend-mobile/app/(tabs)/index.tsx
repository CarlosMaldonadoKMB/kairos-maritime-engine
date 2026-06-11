import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useRef, useEffect } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Image, TextInput, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [vesselName, setVesselName] = useState('');
  const [certType, setCertType] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  
  // 📦 NUEVO ESTADO: Contador de la bodega (Offline)
  const [pendientes, setPendientes] = useState<any[]>([]);

  // Al abrir la app, revisamos si quedaron documentos pendientes en la bodega
  useEffect(() => {
    cargarBodega();
  }, []);

  async function cargarBodega() {
    try {
      const guardados = await AsyncStorage.getItem('@bodega_kairos');
      if (guardados) {
        setPendientes(JSON.parse(guardados));
      }
    } catch (e) {
      console.error("Error leyendo la bodega:", e);
    }
  }

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 18, color: 'white' }}>
          ⚓ Kairos requiere acceso a tu cámara.
        </Text>
        <Button onPress={requestPermission} title="Conceder Permiso" color="#10b981" />
      </View>
    );
  }

  async function tomarFoto() {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setFotoUri(photo.uri); 
    }
  }

  // 🚀 EL NUEVO CEREBRO INTELIGENTE DE ENVÍO
  async function procesarCertificado() {
    if (!vesselName || !certType || !expiryDate) {
      Alert.alert("Faltan Datos", "Por favor completa todos los campos.");
      return;
    }

    // 1. Consultar el Radar de Red
    const networkState = await Network.getNetworkStateAsync();
    
    // Empaquetamos la data
    const paquete = {
      id: Date.now().toString(),
      uri: fotoUri,
      vesselName,
      certType,
      expiryDate,
    };

    if (!networkState.isConnected || !networkState.isInternetReachable) {
      // 🔴 MODO OFFLINE: Guardar en Bodega
      console.log("📡 Sin señal. Guardando en bodega local...");
      const nuevaBodega = [...pendientes, paquete];
      await AsyncStorage.setItem('@bodega_kairos', JSON.stringify(nuevaBodega));
      setPendientes(nuevaBodega);
      
      Alert.alert("📡 Sin Conexión", "Documento guardado en la bodega. Recuerda sincronizar cuando recuperes la señal.");
      limpiarFormulario();
      return;
    }

    // 🟢 MODO ONLINE: Disparo directo a Render/AWS
    await enviarAlServidor(paquete);
  }

  async function enviarAlServidor(paquete: any, esSincronizacion = false) {
    console.log("🚀 Transmitiendo a la central...");
    const formData = new FormData();
    formData.append('file', {
      uri: paquete.uri,
      name: `certificado_${paquete.id}.jpg`,
      type: 'image/jpeg',
    } as any);
    
    formData.append('vessel_name', paquete.vesselName);
    formData.append('type', paquete.certType);
    formData.append('expiry_date', paquete.expiryDate);

    try {
      const urlBackend = 'https://kairos-maritime-backend.onrender.com/api/upload'; 
      const response = await fetch(urlBackend, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.ok) {
        if (!esSincronizacion) {
          Alert.alert("✅ Misión Cumplida", "Documento asegurado en la nube.");
          limpiarFormulario();
        }
        return true; // Éxito
      } else {
        if (!esSincronizacion) Alert.alert("🔴 Error", "El radar central rechazó el paquete.");
        return false;
      }
    } catch (error) {
      if (!esSincronizacion) Alert.alert("❌ Falla", "Revisa tu conexión a internet.");
      return false;
    }
  }

  // 🔄 BOTÓN DE SINCRONIZACIÓN MÚLTIPLE
  async function sincronizarPendientes() {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      Alert.alert("Aviso", "Aún no tienes conexión a internet para sincronizar.");
      return;
    }

    Alert.alert("Sincronizando...", `Enviando ${pendientes.length} documentos.`);
    let enviadosExito = 0;

    for (const item of pendientes) {
      const exito = await enviarAlServidor(item, true);
      if (exito) enviadosExito++;
    }

    // Limpiamos la bodega
    await AsyncStorage.removeItem('@bodega_kairos');
    setPendientes([]);
    Alert.alert("✅ Sincronización Completa", `Se subieron ${enviadosExito} documentos a la base central.`);
  }

  function limpiarFormulario() {
    setFotoUri(null);
    setVesselName('');
    setCertType('');
    setExpiryDate('');
  }

  // ==========================================
  // RENDERIZADO VISUAL
  // ==========================================

  if (fotoUri) {
    return (
      <ScrollView style={styles.formContainer}>
        <Text style={styles.title}>📋 Detalles del Documento</Text>
        <Image source={{ uri: fotoUri }} style={styles.previewImage} />
        <Text style={styles.label}>Nave (Ej: Latitud 41)</Text>
        <TextInput style={styles.input} placeholderTextColor="#64748b" placeholder="Nombre de la nave..." value={vesselName} onChangeText={setVesselName} />
        <Text style={styles.label}>Tipo de Certificado</Text>
        <TextInput style={styles.input} placeholderTextColor="#64748b" placeholder="Ej: Certificado Médico..." value={certType} onChangeText={setCertType} />
        <Text style={styles.label}>Fecha de Vencimiento</Text>
        <TextInput style={styles.input} placeholderTextColor="#64748b" placeholder="YYYY-MM-DD" value={expiryDate} onChangeText={setExpiryDate} />

        <View style={styles.formButtons}>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#ef4444', flex: 1, marginRight: 10 }]} onPress={limpiarFormulario}>
            <Text style={styles.text}>🗑️ DESCARTAR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={procesarCertificado}>
            <Text style={styles.text}>🚀 PROCESAR</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />
      
      {/* 📦 ALERTA FLOTANTE SI HAY PENDIENTES */}
      {pendientes.length > 0 && (
        <TouchableOpacity style={styles.bodegaBanner} onPress={sincronizarPendientes}>
          <Text style={styles.bodegaText}>⚠️ Tienes {pendientes.length} documentos offline. Toca aquí para sincronizar.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.overlay}>
        <TouchableOpacity style={styles.button} onPress={tomarFoto}>
          <Text style={styles.text}>📸 CAPTURAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  camera: { flex: 1 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  button: { backgroundColor: '#10b981', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, elevation: 5, alignItems: 'center' },
  text: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  formContainer: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white', marginTop: 40, marginBottom: 20, textAlign: 'center' },
  previewImage: { width: '100%', height: 200, borderRadius: 10, marginBottom: 20, resizeMode: 'cover' },
  label: { color: '#e2e8f0', fontSize: 16, marginBottom: 5, fontWeight: 'bold' },
  input: { backgroundColor: '#1e293b', color: 'white', padding: 15, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  formButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 40 },
  bodegaBanner: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#f59e0b', padding: 15, borderRadius: 10, zIndex: 100 },
  bodegaText: { color: 'white', fontWeight: 'bold', textAlign: 'center' }
});