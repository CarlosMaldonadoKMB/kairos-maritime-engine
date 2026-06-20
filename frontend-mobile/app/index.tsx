import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await AsyncStorage.getItem('kairos_token');
        if (token) {
          // Si hay token, viajamos a las pestañas
          router.replace('/(tabs)');
        } else {
          // Si no, al login
          router.replace('/login');
        }
      } catch (error) {
        router.replace('/login');
      }
    }
    
    // Le damos 100ms a Expo para estabilizar las rutas antes de saltar
    setTimeout(checkAuth, 100);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#10b981" />
    </View>
  );
}