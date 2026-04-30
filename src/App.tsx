import { useState } from 'react';

import HomeScreen from './components/HomeScreen.tsx';
import Onboarding from './components/Onboarding.tsx';
import { getOnboardingRoute, type OnboardingRoute } from './lib/onboarding.ts';
import { getOnboardingComplete, type ChatMessage } from './lib/storage.ts';

function App() {
  const [route, setRoute] = useState<OnboardingRoute>(() =>
    getOnboardingRoute(getOnboardingComplete()),
  );
  const [homeMessages, setHomeMessages] = useState<ChatMessage[] | undefined>();

  if (route === 'onboarding') {
    return (
      <Onboarding
        onComplete={(closingMessage: ChatMessage) => {
          setHomeMessages([closingMessage]);
          setRoute('home');
        }}
      />
    );
  }

  return <HomeScreen initialMessages={homeMessages} />;
}

export default App;
