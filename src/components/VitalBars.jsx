import { useEffect, useState } from 'react';

import { defaultBubbyState } from '../lib/vitalDecay.ts';
import {
  getBubbyState,
  setBubbyState,
} from '../lib/storage.ts';

const VITALS = [
  { key: 'vitality', label: 'vit' },
  { key: 'mood', label: 'mood' },
  { key: 'strength', label: 'str' },
  { key: 'energy', label: 'nrg' },
];

function readBubbyState() {
  const existingState = getBubbyState();
  if (existingState) {
    return existingState;
  }

  return setBubbyState(defaultBubbyState());
}

function valueTone(value) {
  if (value < 30) {
    return 'red';
  }

  if (value < 60) {
    return 'yellow';
  }

  return 'green';
}

function VitalBars({ refreshKey = 0 }) {
  const [bubbyState, setLocalBubbyState] = useState(readBubbyState);

  useEffect(() => {
    setLocalBubbyState(readBubbyState());
  }, [refreshKey]);

  useEffect(() => {
    function refreshFromStorage() {
      setLocalBubbyState(readBubbyState());
    }

    window.addEventListener('bubby-state-updated', refreshFromStorage);
    window.addEventListener('storage', refreshFromStorage);

    return () => {
      window.removeEventListener('bubby-state-updated', refreshFromStorage);
      window.removeEventListener('storage', refreshFromStorage);
    };
  }, []);

  return (
    <section className="vital-bars" aria-label="bubby vital bars">
      {VITALS.map((vital) => {
        const value = Math.max(0, Math.min(100, Math.round(bubbyState[vital.key] ?? 0)));
        const tone = valueTone(value);

        return (
          <div className="vital-bar" data-vital={vital.key} key={vital.key}>
            <div className="vital-bar-label-row">
              <span className="vital-bar-label">{vital.label}</span>
              <span className="vital-bar-value">{value}</span>
            </div>
            <div className="vital-bar-track" aria-hidden="true">
              <div
                className={`vital-bar-fill vital-bar-fill-${tone}`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default VitalBars;
