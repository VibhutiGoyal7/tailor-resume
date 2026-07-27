import { ScreenContainer } from '../components/ScreenContainer';
import { ComingSoon } from '../components/ComingSoon';

// Home = the entry to the tailoring flow (paste a JD → tailor). Full build: M8 slice 4.
export function HomeScreen() {
  return (
    <ScreenContainer>
      <ComingSoon title="Home" note="The tailoring flow lands here — Milestone 8, slice 4." />
    </ScreenContainer>
  );
}
