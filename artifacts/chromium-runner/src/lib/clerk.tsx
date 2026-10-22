import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315b54',
    colorForeground: '#263c34',
    colorMutedForeground: '#5b6d66',
    colorDanger: '#a34f43',
    colorBackground: '#f7f8f2',
    colorInput: '#ffffff',
    colorInputForeground: '#263c34',
    colorNeutral: '#2f4240',
    fontFamily: "'Manrope', sans-serif",
    borderRadius: '0.6rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f7f8f2] rounded-2xl w-[420px] max-w-full overflow-hidden border border-[#d6d8d0] shadow-[0_16px_42px_rgba(42,56,53,.12)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263c34] font-bold tracking-tight',
    headerSubtitle: 'text-[#5b6d66]',
    socialButtonsBlockButtonText: 'text-[#263c34] font-semibold',
    formFieldLabel: 'text-[#2f4240] font-semibold',
    footerActionLink: 'text-[#315b54] font-bold',
    footerActionText: 'text-[#5b6d66]',
    dividerText: 'text-[#5b6d66]',
    identityPreviewEditButton: 'text-[#315b54]',
    formFieldSuccessText: 'text-[#3f6f57]',
    alertText: 'text-[#7d3a30]',
    logoBox: 'h-11 justify-center',
    logoImage: 'h-11 w-11',
    socialButtonsBlockButton: 'bg-white border border-[#cfd6cc]',
    formButtonPrimary: 'bg-[#315b54] text-[#f3f1e8] font-bold',
    formFieldInput: 'bg-white border border-[#bccdc0] text-[#263c34]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#d6d8d0]',
    alert: 'bg-[#fff5ef] border border-[#e5c9bf]',
    otpCodeFieldInput: 'border border-[#bccdc0] text-[#263c34]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function AuthFrame({ children, title }: { children: ReactNode; title: string }) {
  useEffect(() => { document.title = `${title} - Chromium Browser Runner`; }, [title]);
  return <div className="auth-shell">{children}<p className="auth-note">Accounts are only needed for the site owner. Visitors must accept activity logging to use the browser and chat.</p></div>;
}

export function SignInPage() {
  return <AuthFrame title="Sign in"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/owner`} /></AuthFrame>;
}

export function SignUpPage() {
  return <AuthFrame title="Sign up"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/owner`} /></AuthFrame>;
}

export function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) queryClient.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

export function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Owner sign in', subtitle: 'View activity from browsers that opted in' } },
        signUp: { start: { title: 'Create an account', subtitle: 'Owner access is granted separately' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}
