import { useState } from 'react';

import HomeScreen from './components/HomeScreen.jsx';
import Onboarding from './components/Onboarding.jsx';
import { getOnboardingRoute } from './lib/onboarding.js';
import { getOnboardingComplete } from './lib/storage.js';

function App() {
  const [route, setRoute] = useState(() =>
    getOnboardingRoute(getOnboardingComplete()),
  );
  const [homeMessages, setHomeMessages] = useState();

  if (route === 'onboarding') {
    return (
      <Onboarding
        onComplete={(closingMessage) => {
          setHomeMessages([closingMessage]);
          setRoute('home');
        }}
      />
    );
  }

  return <HomeScreen initialMessages={homeMessages} />;
}

export default App;
