import React, { useRef, useEffect } from 'react';
import { NavigationContainer, NavigationContainerRef, LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Feather';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

// Import screens
import HomeScreen from './src/screens/HomeScreen';
import InfluencerStakingScreen from './src/screens/InfluencerStakingScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import ProfileScreen from './src/screens/ProfileScreen';

// Import services
import { DeeplinkService } from './src/services/deeplink.service';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const StakingStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="StakingList" 
      component={InfluencerStakingScreen}
      options={{ title: 'Stake on Influencers' }}
    />
  </Stack.Navigator>
);

// Define linking configuration
const linking: LinkingOptions<any> = {
  prefixes: ['twist://', 'https://twist.to', 'https://www.twist.to'],
  config: {
    screens: {
      Home: 'home',
      Staking: {
        screens: {
          StakingList: 'stake/:influencerId?',
        },
      },
      Portfolio: 'portfolio',
      Profile: 'profile',
    },
  },
};

const App = () => {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const deeplinkService = useRef<DeeplinkService | null>(null);

  useEffect(() => {
    // Initialize deeplink service
    deeplinkService.current = new DeeplinkService();

    // Request notification permissions
    requestNotificationPermissions();

    return () => {
      deeplinkService.current?.cleanup();
    };
  }, []);

  const requestNotificationPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      logger.log('Failed to get push token for push notification!');
    }
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => {
          deeplinkService.current?.setNavigation(navigationRef.current!);
        }}
      >
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;

              if (route.name === 'Home') {
                iconName = 'home';
              } else if (route.name === 'Staking') {
                iconName = 'trending-up';
              } else if (route.name === 'Portfolio') {
                iconName = 'briefcase';
              } else if (route.name === 'Profile') {
                iconName = 'user';
              }

              return <Icon name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: '#8B5CF6',
            tabBarInactiveTintColor: 'gray',
          })}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Staking" component={StakingStack} />
          <Tab.Screen name="Portfolio" component={PortfolioScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;