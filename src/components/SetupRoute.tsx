import { useAuth } from '../hooks/useAuth';
import { SetupPage } from './SetupPage';

export function SetupRoute() {
  const auth = useAuth();

  return (
    <SetupPage
      authLoading={auth.loading}
      isAuthenticated={auth.isAuthenticated}
      user={auth.user}
      needsStravaConnect={auth.needsStravaConnect}
      login={auth.login}
      connectStrava={auth.connectStrava}
      sendMagicLink={auth.sendMagicLink}
      logout={auth.logout}
    />
  );
}
