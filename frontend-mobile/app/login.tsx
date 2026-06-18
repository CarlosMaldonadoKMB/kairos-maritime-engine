import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { kairosFetch } from '@/services/api';


export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

async function manejarLogin() {
  if (!email || !password) {
    Alert.alert("Campos Vacíos", "Por favor, ingresa tu correo de tripulante y contraseña.");
    return;
  }

  setLoading(true);

  try {
    // Ya no necesitas poner la URL completa ni el header de JSON, 
    // el servicio se encarga de eso.
    const response = await kairosFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await response.json();
    
    // Aquí guardas el token y rediriges
    await AsyncStorage.setItem('kairos_token', data.token);
    // ... tu lógica de redirección
    
  } catch (error: any) {
    // Si el error es el 401 que definimos en api.ts, se maneja aquí
    Alert.alert("Error de Acceso", error.message || 'Fallo en la autenticación');
  } finally {
    setLoading(false);
  }
}

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        
        <View style={styles.headerContainer}>
          <Text style={styles.logo}>KAIROS <Text style={styles.logoSub}>MARITIME</Text></Text>
          <Text style={styles.subtitle}>SISTEMA DE CONTROL DE FLOTAS</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.titleForm}>Ingreso de Tripulación</Text>

          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput 
            style={styles.input}
            placeholder="ejemplo@naviera.com"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Contraseña Secreta</Text>
          <TextInput 
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#64748b"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={manejarLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>⚓ TOMAR EL MANDO</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>Secure Connection • Multi-Tenant Engine</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 32, fontWeight: '900', color: '#3b82f6', letterSpacing: 2 },
  logoSub: { color: 'white' },
  subtitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginTop: 5, letterSpacing: 1 },
  formCard: { backgroundColor: '#1e293b', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#334155', elevation: 4 },
  titleForm: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
  label: { color: '#e2e8f0', fontSize: 14, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: '#0f172a', color: 'white', padding: 15, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#334155', fontSize: 15 },
  button: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { fontSize: 16, fontWeight: 'bold', color: 'white', letterSpacing: 1 },
  footerText: { color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 40, fontWeight: '600' }
});