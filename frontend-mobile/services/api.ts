import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://kairos-maritime-backend.onrender.com/api';

export async function kairosFetch(endpoint: string, options: any = {}) {
  const token = await AsyncStorage.getItem('kairos_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // ¡Aquí está el blindaje!
  if (response.status === 401) {
    console.warn('⚠️ Sesión expirada. Limpiando credenciales...');
    await AsyncStorage.removeItem('kairos_token');
    // Esto disparará la redirección al login en tu _layout.tsx automáticamente
    throw new Error('UNAUTHORIZED');
  }

  return response;
}