// Navigation param lists — shared so screens get typed route/navigation props.
// The app is an auth stack (shown logged-out) OR a 4-tab bar (shown logged-in),
// gated by auth status in RootNavigator (build brief / project doc §: "bottom
// navigation, 4 tabs sitting on top of an auth stack that exists outside the nav").
export type AuthStackParamList = {
  Auth: undefined;
};

export type AppTabsParamList = {
  Home: undefined;
  Bank: undefined;
  Resumes: undefined;
  Profile: undefined;
};
