// Navigation param lists — shared so screens get typed route/navigation props.
// The app is an auth stack (logged out) OR a 4-tab bar (logged in), with a
// one-time First-run choice in between (rendered by RootNavigator on the auth
// status + first-run flag).
export type AuthMode = 'signup' | 'login';

export type AuthStackParamList = {
  Welcome: undefined;
  Auth: { mode?: AuthMode } | undefined;
  VerifyEmail: { email: string };
  ForgotPassword: undefined;
  // token arrives via the reset deep link; absent when opened directly.
  ResetPassword: { token?: string } | undefined;
};

export type AppTabsParamList = {
  Home: undefined;
  Bank: undefined;
  Resumes: undefined;
  Profile: undefined;
};
