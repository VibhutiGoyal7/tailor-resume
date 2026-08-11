// "Customize layout" (screens/tailor_screen_layout_customize.svg): drag to reorder
// the resume's sections, tap the eye to hide one, and pick one- vs two-column, then
// "Apply changes" (PATCH /resumes/:id/layout) and move on to export.
//
// The five sections (Summary, Experience, Projects, Education, Skills) are all
// first-class in the content model now: Experience/Projects/Education each render the
// tailored bullets whose source Experience item is of that kind (RESUME_SECTIONS /
// sectionForItemType). A section with no bullets is still reorderable/hideable here
// but simply renders nothing in the export. The one-/two-column toggle maps to the
// template's layout family (two-column → the `modern` template; one-column → a
// single-column template), since `template.layout` is exactly that distinction.
import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  RESUME_SECTIONS,
  TEMPLATES,
  type ResumeSection,
  type TailoredResumeView,
  type TemplateId,
} from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { getResume, updateResumeLayout } from '../../api/tailoring';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { useQuery } from '@tanstack/react-query';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LayoutCustomize'>;

const SECTION_LABEL: Record<ResumeSection, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
};

const ROW_H = 64; // fixed row slot height (incl. gap) — drag math depends on it.

type Columns = 'one' | 'two';

export function LayoutCustomizeScreen({ navigation, route }: Props) {
  const { resumeId } = route.params;
  const resume = useQuery({ queryKey: ['resume', resumeId], queryFn: () => getResume(resumeId) });

  return resume.data ? (
    <CustomizeForm navigation={navigation} resumeId={resumeId} initial={resume.data} />
  ) : (
    <ScreenContainer>
      <ScreenHeader title="Customize layout" onBack={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

function CustomizeForm({
  navigation,
  resumeId,
  initial,
}: {
  navigation: Props['navigation'];
  resumeId: string;
  initial: TailoredResumeView;
}) {
  const [order, setOrder] = useState<ResumeSection[]>(
    initial.sectionOrder.filter((s): s is ResumeSection =>
      (RESUME_SECTIONS as readonly string[]).includes(s),
    ),
  );
  const [hidden, setHidden] = useState<Record<ResumeSection, boolean>>(() => {
    const h = {} as Record<ResumeSection, boolean>;
    for (const s of RESUME_SECTIONS) h[s] = initial.hiddenSections.includes(s);
    return h;
  });
  const [columns, setColumns] = useState<Columns>(
    TEMPLATES[initial.templateId].layout === 'two-column' ? 'two' : 'one',
  );
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const apply = useMutation({
    mutationFn: () => {
      // One-column keeps a single-column template (the current one if it already is,
      // else the ATS default); two-column is the modern template.
      const oneCol: TemplateId =
        TEMPLATES[initial.templateId].layout === 'single-column' ? initial.templateId : 'ats';
      const templateId: TemplateId = columns === 'two' ? 'modern' : oneCol;
      return updateResumeLayout(resumeId, {
        sectionOrder: order,
        hiddenSections: RESUME_SECTIONS.filter((s) => hidden[s]),
        templateId,
      });
    },
    onSuccess: () => {
      logger.info('layout applied', { resumeId, order, columns });
      navigation.replace('Export', { resumeId });
    },
    onError: (err) => setDialog(errorToCopy(err)),
  });

  const move = (from: number, to: number) => {
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Customize layout"
        subtitle="Drag to reorder, tap the eye to hide."
        onBack={() => navigation.goBack()}
      />

      <View style={{ height: order.length * ROW_H }}>
        {order.map((section, index) => (
          <SectionRow
            key={section}
            index={index}
            count={order.length}
            label={SECTION_LABEL[section]}
            hidden={hidden[section]}
            onToggleHide={() => setHidden((p) => ({ ...p, [section]: !p[section] }))}
            onMove={move}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>LAYOUT</Text>
      <SegmentedControl<Columns>
        options={[
          { key: 'one', label: 'One column' },
          { key: 'two', label: 'Two column' },
        ]}
        value={columns}
        onChange={setColumns}
      />

      <Button
        label="Apply changes"
        onPress={() => apply.mutate()}
        loading={apply.isPending}
        disabled={apply.isPending}
        style={styles.cta}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

// A draggable section row. Absolutely positioned at its slot (index * ROW_H); a
// vertical PanResponder on the grip lifts the row and follows the finger, and on
// release it reorders to the nearest slot. `hidden` dims the row and slashes the eye.
function SectionRow({
  index,
  count,
  label,
  hidden,
  onToggleHide,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  hidden: boolean;
  onToggleHide: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const dy = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_e, g) => dy.setValue(g.dy),
      onPanResponderRelease: (_e, g) => {
        const from = indexRef.current;
        const target = Math.max(0, Math.min(count - 1, from + Math.round(g.dy / ROW_H)));
        dy.setValue(0);
        setDragging(false);
        if (target !== from) onMove(from, target);
      },
      onPanResponderTerminate: () => {
        dy.setValue(0);
        setDragging(false);
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.rowSlot,
        { top: index * ROW_H },
        { transform: [{ translateY: dy }] },
        dragging ? styles.rowDragging : null,
      ]}
    >
      <View style={[styles.row, hidden ? styles.rowHidden : null]}>
        <View style={styles.grip} {...pan.panHandlers}>
          <Grip />
        </View>
        <Text style={[styles.rowLabel, hidden ? styles.rowLabelHidden : null]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? `Show ${label}` : `Hide ${label}`}
          onPress={onToggleHide}
          hitSlop={10}
          style={styles.eyeBtn}
        >
          <Eye off={hidden} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function Grip() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      {[5, 9, 13].map((y) => (
        <Line key={y} x1={3} y1={y} x2={15} y2={y} stroke={colors.iconMuted} strokeWidth={1.6} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

function Eye({ off }: { off: boolean }) {
  const stroke = off ? colors.iconMuted : colors.accent;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z"
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={2.6} fill={stroke} />
      {off ? <Line x1={4} y1={20} x2={20} y2={4} stroke={colors.iconMuted} strokeWidth={1.8} strokeLinecap="round" /> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  rowSlot: { position: 'absolute', left: 0, right: 0, height: ROW_H, justifyContent: 'center' },
  rowDragging: { zIndex: 10, elevation: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    height: ROW_H - spacing.md,
    ...radii.card,
  },
  rowHidden: { backgroundColor: colors.background },
  grip: { paddingVertical: spacing.md, paddingRight: spacing.md },
  rowLabel: { ...typography.body, color: colors.ink, flex: 1 },
  rowLabelHidden: { color: colors.iconMuted },
  eyeBtn: { padding: spacing.xs },

  sectionLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  cta: { marginTop: spacing.xxl },
});
