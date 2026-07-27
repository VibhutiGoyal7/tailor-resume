import { ScreenContainer } from '../components/ScreenContainer';
import { ComingSoon } from '../components/ComingSoon';

// Resume history (list) → detail → export/layout. M8 slice 5.
export function ResumesScreen() {
  return (
    <ScreenContainer>
      <ComingSoon title="Resumes" note="Your tailored resumes and downloads — Milestone 8, slice 5." />
    </ScreenContainer>
  );
}
