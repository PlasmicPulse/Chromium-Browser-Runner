import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import OwnerPage from '@/pages/owner';
import { ActivityConsentProvider } from '@/lib/activity-consent';
import { ActivityAccessGate } from '@/components/activity-access-gate';
import { TabAppearanceProvider } from '@/lib/tab-appearance-context';
import { ClerkProviderWithRouter, ClerkQueryClientCacheInvalidator, SignInPage, SignUpPage, basePath } from '@/lib/clerk';

const queryClient = new QueryClient();

function PublicHome() {
  return <ActivityConsentProvider><ActivityAccessGate><Home /></ActivityAccessGate></ActivityConsentProvider>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={PublicHome} />
        <Route path="/owner" component={OwnerPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRouter>
        <QueryClientProvider client={queryClient}>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <TabAppearanceProvider><Router /></TabAppearanceProvider>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProviderWithRouter>
    </WouterRouter>
  );
}

export default App;
