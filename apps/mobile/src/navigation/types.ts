// Navigation param lists — shared so screens get typed route/navigation props.
// The app is an auth stack (logged out) OR a 4-tab bar (logged in), with a
// one-time First-run choice in between (rendered by RootNavigator on the auth
// status + first-run flag).
import type { ExperienceType } from '@tailor/shared-types';
import type { TailorPhase } from '../lib/tailoring';

export type AuthMode = 'signup' | 'login';

// The logged-in app is a root native stack: the tab bar is the base screen, and the
// tailoring flow (JD input → staged progress → retrieval checkpoint → result →
// customize → export) pushes over it. Keeping the flow at the root (not inside a
// tab) lets it present full-screen over the whole app and be entered from Home.
export type RootStackParamList = {
  Tabs: undefined;
  JDInput: undefined;
  // `phase` selects which staged-progress screen we're on: 'retrieve' (parse →
  // checkpoint) or 'generate' (write → done).
  StagedProgress: { jobId: string; phase: TailorPhase };
  RetrievalCheckpoint: { jobId: string };
  Result: { resumeId: string };
  LayoutCustomize: { resumeId: string };
  Export: { resumeId: string };
};

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

// Experience Bank flow (the Bank tab is a stack): list → add-entry choice →
// (manual) type picker → the per-type form; and list/detail for an existing item.
// The two extraction paths (write-about-it, import) are gated on the LLM
// extraction backend and land with it.
export type BankStackParamList = {
  BankList: undefined;
  AddEntryChoice: undefined;
  ChooseType: undefined;
  ItemForm: { type: ExperienceType };
  WriteAboutIt: undefined;
  ImportResume: undefined;
  // Review LLM-suggested bullets for a freshly-extracted item before keeping them.
  BulletReview: { itemId: string };
  // Review suggestions across several items imported from a resume at once.
  ImportReview: { itemIds: string[] };
  ItemDetail: { itemId: string };
};
