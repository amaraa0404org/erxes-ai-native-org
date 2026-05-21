import { IconRobot } from '@tabler/icons-react';
import { Suspense, lazy } from 'react';

import { IUIConfig } from 'erxes-ui';

const Main = lazy(() =>
  import('./modules/Main').then((module) => ({
    default: module.Main,
  })),
);

const AISettingsNavigation = lazy(() =>
  import('./modules/AISettingsNavigation').then((module) => ({
    default: module.AISettingsNavigation,
  })),
);

export const CONFIG: IUIConfig = {
  name: 'ai',
  path: 'ai',
  icon: IconRobot,
  settingsNavigation: () => (
    <Suspense fallback={<div />}>
      <AISettingsNavigation />
    </Suspense>
  ),
  navigationGroup: {
    name: 'ai',
    icon: IconRobot,
    content: () => (
      <Suspense fallback={<div />}>
        <Main />
      </Suspense>
    ),
  },
  modules: [
    {
      name: 'ai',
      icon: IconRobot,
      path: 'ai',
    },
  ],
};
