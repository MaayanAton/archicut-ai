import { describe, expect, it } from 'vitest';
import { toVisual } from './bidi';

const rev = (s: string) => [...s].reverse().join('');

describe('visual order for right-to-left text in PDF', () => {
  it('reverses plain Hebrew', () => {
    expect(toVisual('שם')).toBe('םש');
  });
  it('keeps numbers left to right and puts them on the correct side', () => {
    // "אורך 100 מ״מ": the number keeps its digit order and sits between the words.
    expect(toVisual('אורך 100 מ״מ')).toBe(`${rev('מ״מ')} 100 ${rev('אורך')}`);
  });
  it('keeps decimal numbers and ratios intact', () => {
    expect(toVisual('קנה מידה 1:50')).toBe(`1:50 ${rev('קנה מידה')}`);
    expect(toVisual('שטח 14142.1')).toBe(`14142.1 ${rev('שטח')}`);
  });
  it('mirrors brackets inside Hebrew', () => {
    expect(toVisual('חתך (משוער)')).toBe(`(${rev('משוער')}) ${rev('חתך')}`);
  });
  it('keeps Latin words and formulas such as A-A and π2', () => {
    expect(toVisual('חתך A-A')).toBe(`A-A ${rev('חתך')}`);
    expect(toVisual('לפני π2')).toBe(`π2 ${rev('לפני')}`);
    expect(toVisual('100 mm')).toBe('100 mm');
  });
  it('handles a unit with superscript', () => {
    expect(toVisual('שטח 50 מ״מ²')).toBe(`²${rev('מ״מ')} 50 ${rev('שטח')}`);
  });
});
