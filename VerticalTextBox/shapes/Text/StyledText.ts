import type { StylePropertiesType } from './constants';
import { VerticalText } from './VerticalText';
export type CompleteTextStyleDeclaration = Pick<VerticalText, StylePropertiesType>;

export type TextStyleDeclaration = Partial<CompleteTextStyleDeclaration>;

export type TextStyle = {
  [line: number | string]: { [char: number | string]: TextStyleDeclaration };
};
