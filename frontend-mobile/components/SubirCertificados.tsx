import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  vesselId: string;
  token: string;
}

export default function SubirCertificadoComponent({ vesselId, token }: Props) {
  const [tipoCertificado, setTipoCertificado] = useState('');
  const [fechaExpiracion, setFechaExpiracion] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tomarFoto = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!resultado.canceled && resultado.assets) {
      setImagen(resultado.assets[0].uri);
    }
  };

  const transferirAlBackend = async () => {
    if (!tipoCertificado || !fechaExpiracion || !imagen) {
      Alert.alert('Faltan Datos', 'Completa los campos y toma la foto.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('vessel_id', vesselId);
    formData.append('type', tipoCertificado);
    formData.append('expiry_date', fechaExpiracion);

    const nombreArchivo = imagen.split('/').pop() || 'certificado.jpg';
    const match = /\.(\w+)$/.exec(nombreArchivo);
    const tipoMime = match ? `image/${match[1]}` : `image/jpeg`;

    formData.append('file', {
      uri: imagen,
      name: nombreArchivo,
      type: tipoMime,
    } as any);

    try {
      const response = await fetch('https://kairos-maritime-backend.onrender.com/api/certificates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert('⚓ ¡Éxito!', 'Certificado subido a AWS S3 y guardado en Neon.');
        setImagen(null); setTipoCertificado(''); setFechaExpiracion('');
      } else {
        Alert.alert('Error', 'Falla al procesar en el servidor.');
      }
    } catch (error) {
      Alert.alert('Error de Red', 'No se pudo conectar con Render.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Carga de Certificados</Text>
      
      <TextInput 
        placeholder="Tipo de Certificado (Ej: Balsa)" 
        placeholderTextColor="#64748b"
        value={tipoCertificado}
        onChangeText={setTipoCertificado}
        style={styles.input}
      />

      <TextInput 
        placeholder="Fecha Expiración (YYYY-MM-DD)" 
        placeholderTextColor="#64748b"
        value={fechaExpiracion}
        onChangeText={setFechaExpiracion}
        style={styles.input}
      />

      <TouchableOpacity style={styles.btnFoto} onPress={tomarFoto}>
        <Text style={styles.btnText}>{imagen ? '📸 ¡Foto Capturada!' : '📷 Tomar Foto del Documento'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnEnviar} onPress={transferirAlBackend} disabled={loading}>
        {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnEnviarText}>🚀 Enviar al Motor</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 12, margin: 10 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { backgroundColor: '#0f172a', color: '#ffffff', padding: 12, borderRadius: 8, marginBottom: 12 },
  btnFoto: { backgroundColor: '#334155', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#cbd5e1', fontWeight: '600' },
  btnEnviar: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnEnviarText: { color: '#0f172a', fontWeight: 'bold', fontSize: 16 }
});