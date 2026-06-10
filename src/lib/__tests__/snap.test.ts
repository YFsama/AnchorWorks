import { afterEach, describe, expect, it } from 'vitest';
import { maybeSnap, snapPointToUserGuides } from '../snap';
import { useEditor, type UserGuide } from '../../store/editor';

const originalState = useEditor.getState();

function setSnapState(patch: Partial<{
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSize: number;
  smartGuidesEnabled: boolean;
  guidesVisible: boolean;
  userGuides: UserGuide[];
}>) {
  useEditor.setState({
    snapEnabled: false,
    gridVisible: false,
    gridSize: 20,
    smartGuidesEnabled: true,
    guidesVisible: true,
    userGuides: [],
    ...patch,
  });
}

afterEach(() => {
  useEditor.setState({
    snapEnabled: originalState.snapEnabled,
    gridVisible: originalState.gridVisible,
    gridSize: originalState.gridSize,
    smartGuidesEnabled: originalState.smartGuidesEnabled,
    guidesVisible: originalState.guidesVisible,
    userGuides: originalState.userGuides,
  });
});

describe('snapPointToUserGuides', () => {
  it('snaps a drawing point to nearby visible ruler guides', () => {
    setSnapState({
      userGuides: [
        { id: 'v1', axis: 'v', pos: 100 },
        { id: 'h1', axis: 'h', pos: 50 },
      ],
    });

    expect(snapPointToUserGuides({ x: 96, y: 55 })).toEqual({ x: 100, y: 50 });
  });

  it('ignores guides when smart guides are disabled or hidden', () => {
    setSnapState({ smartGuidesEnabled: false, userGuides: [{ id: 'v1', axis: 'v', pos: 100 }] });
    expect(snapPointToUserGuides({ x: 96, y: 20 })).toEqual({ x: 96, y: 20 });

    setSnapState({ guidesVisible: false, userGuides: [{ id: 'v1', axis: 'v', pos: 100 }] });
    expect(snapPointToUserGuides({ x: 96, y: 20 })).toEqual({ x: 96, y: 20 });
  });

  it('leaves points outside tolerance unchanged', () => {
    setSnapState({ userGuides: [{ id: 'v1', axis: 'v', pos: 100 }] });

    expect(snapPointToUserGuides({ x: 93, y: 20 })).toEqual({ x: 93, y: 20 });
  });
});

describe('maybeSnap', () => {
  it('applies grid snap first, then guide snap for shape creation', () => {
    setSnapState({
      snapEnabled: true,
      gridVisible: true,
      gridSize: 10,
      userGuides: [
        { id: 'v1', axis: 'v', pos: 39 },
        { id: 'h1', axis: 'h', pos: 61 },
      ],
    });

    expect(maybeSnap({ x: 36, y: 56 })).toEqual({ x: 39, y: 61 });
  });
});
