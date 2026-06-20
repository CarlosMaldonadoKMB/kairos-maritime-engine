import React, { useState, useRef, useEffect } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Image, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { jwtDecode } from "jwt-decode";

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [certType, setCertType] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [tokenCompleto, setTokenCompleto] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<any[]>([]);

  useEffect(() => {
    cargarCredencialesYBodega();
  }, []);

  async function cargarCredencialesYBodega() {
    try {
      const token = await AsyncStorage.getItem('kairos_token');
      if (token) {
        setTokenCompleto(token);
        const decoded: any = jwtDecode(token);
        setVesselId(decoded.assigned_vessel_id);
      }
      const guardados = await AsyncStorage.getItem('@bodega_kairos');
      if (guardados) {
        setPendientes(JSON.parse(guardados));
      }
    } catch (e) {
      console.error("Error leyendo credenciales o bodega:", e);
    }
  }

  // 🛡️ BLINDAJE DE PERMISOS: Pantalla de carga en vez de pantalla negra
  if (!permission) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ color: 'white', marginTop: 10 }}>Iniciando ópticas del radar...</Text>
      </View>
    );
  }

  // 🛡️ BLINDAJE DE PERMISOS: Botón visible para solicitar acceso
  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.permissionText}>
          ⚓ Kairos requiere acceso a tu cámara para digitalizar certificados en altamar.
        </Text>
        <Button onPress={requestPermission} title="Conceder Permiso" color="#10b981" />
      </View>
    );
  }

  async function tomarFoto() {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo) setFotoUri(photo.uri); 
    }
  }

  async function procesarCertificado() {
    if (!certType || !expiryDate || !fotoUri) {
      Alert.alert("Campos Incompletos", "Por favor completa el tipo, la fecha y captura la foto.");
      return;
    }

    if (!vesselId) {
      Alert.alert("Error de Asignación", "No tienes una nave asignada. Contacta al gerente.");
      return;
    }

    const networkState = await Network.getNetworkStateAsync();
    
    const paquete = {
      id: Date.now().toString(),
      uri: fotoUri,
      vesselId: vesselId, 
      certType,
      expiryDate,
    };

    if (!networkState.isConnected || !networkState.isInternetReachable) {
      console.log("📡 Sin señal en altamar. Guardando en bodega local...");
      const nuevaBodega = [...pendientes, paquete];
      await AsyncStorage.setItem('@bodega_kairos', JSON.stringify(nuevaBodega));
      setPendientes(nuevaBodega);
      
      Alert.alert("📡 Modo Offline Activado", "Documento resguardado en la bodega del teléfono. Sincroniza al llegar a puerto.");
      limpiarFormulario();
      return;
    }

    setLoading(true);
    const exito = await enviarAlServidor(paquete);
    setLoading(false);
    if (exito) {
      Alert.alert("✅ Transmisión Exitosa", "Certificado procesado y asegurado en la nube corporativa.");
      limpiarFormulario();
    }
  }

  async function enviarAlServidor(paquete: any, esSincronizacion = false) {
    const formData = new FormData();
    
    formData.append('vessel_id', paquete.vesselId);
    formData.append('type', paquete.certType);
    formData.append('expiry_date', paquete.expiryDate);
    
    formData.append('file', {
      uri: paquete.uri,
      name: `certificado_${paquete.id}.jpg`,
      type: 'image/jpeg',
    } as any);

    try {
      const response = await fetch('https://kairos-maritime-backend.onrender.com/api/certificates', {
        method: 'POST',
        body: formData,
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${tokenCompleto}` 
        },
      });

      return response.ok;
    } catch (error) {
      console.error("Fallo de transmisión:", error);
      return false;
    }
  }

  async function sincronizarPendientes() {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      Alert.alert("Sin Señal", "Aún no detectamos conexión estable a internet.");
      return;
    }

    setLoading(true);
    let enviadosExito = 0;

    for (const item of pendientes) {
      const exito = await enviarAlServidor(item, true);
      if (exito) enviadosExito++;
    }

    await AsyncStorage.removeItem('@bodega_kairos');
    setPendientes([]);
    setLoading(false);
    
    Alert.alert("✅ Bodega Sincronizada", `Se subieron ${enviadosExito} documentos pendientes al servidor central.`);
  }

  function limpiarFormulario() {
    setFotoUri(null);
    setCertType('');
    setExpiryDate('');
  }

  if (fotoUri) {
    return (
      <ScrollView style={styles.formContainer}>
        <Text style={styles.title}>📋 Detalles del Certificado</Text>
        <Image source={{ uri: fotoUri }} style={styles.previewImage} />
        
        <Text style={styles.label}>Tipo de Certificado</Text>
        <TextInput 
          style={styles.input} 
          placeholderTextColor="#64748b" 
          placeholder="Ej: Balsa Salvavidas, Extintores..." 
          value={certType} 
          onChangeText={setCertType} 
        />
        
        <Text style={styles.label}>Fecha de Vencimiento</Text>
        <TextInput 
          style={styles.input} 
          placeholderTextColor="#64748b" 
          placeholder="AAAA-MM-DD" 
          value={expiryDate} 
          onChangeText={setExpiryDate} 
        />

        <View style={styles.formButtons}>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#ef4444', flex: 1, marginRight: 10 }]} onPress={limpiarFormulario} disabled={loading}>
            <Text style={styles.text}>🗑️ DESCARTAR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={procesarCertificado} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.text}>🚀 PROCESAR</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />
      
      {pendientes.length > 0 && (
        <TouchableOpacity style={styles.bodegaBanner} onPress={sincronizarPendientes} disabled={loading}>
          <Text style={styles.bodegaText}>
            {loading ? "Sincronizando contenedores..." : `⚠️ Tienes ${pendientes.length} cargas pendientes. Toca para sincronizar.`}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.overlay}>
        <TouchableOpacity style={styles.captureButton} onPress={tomarFoto}>
          <Text style={styles.text}>📸 CAPTURAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  camera: { flex: 1 },
  permissionText: { textAlign: 'center', marginBottom: 20, fontSize: 16, color: 'white', paddingHorizontal: 20, marginTop: 100 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  captureButton: { backgroundColor: '#10b981', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, elevation: 5 },
  button: { backgroundColor: '#3b82f6', paddingVertical: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  formContainer: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white', marginTop: 40, marginBottom: 20, textAlign: 'center' },
  previewImage: { width: '100%', height: 240, borderRadius: 12, marginBottom: 20, resizeMode: 'cover' },
  label: { color: '#e2e8f0', fontSize: 15, marginBottom: 6, fontWeight: 'bold' },
  input: { backgroundColor: '#1e293b', color: 'white', padding: 15, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  formButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 40 },
  bodegaBanner: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#f59e0b', padding: 15, borderRadius: 10, zIndex: 100 },
  bodegaText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 13 }
});