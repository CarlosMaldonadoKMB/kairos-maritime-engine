import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#0f172a', // Fondo oscuro para que combine con tu app
          borderTopColor: '#334155',
        }
      }}>
      
      {/* TAB 1: RADAR (El Dashboard Principal) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Radar',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />

      {/* TAB 2: ESCÁNER (La Cámara Offline) */}
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Escáner',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="camera.fill" color={color} />,
        }}
      />

      {/* TAB 3: EXPEDIENTE (El Historial y Modo Inspección) */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Expediente',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="folder.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}