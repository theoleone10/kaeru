import feedback from '../../content/sentences/feedback.json';
import { getPoint } from '../content/loader';

type HintTable = Record<string, Record<string, string>>;
const TABLE = feedback as unknown as HintTable;

/** Hint text for a point and error type: the point's own text, else the generic one. */
export function hintFor(pointId: string, errorType: string): string {
  const text = TABLE[pointId]?.[errorType] ?? TABLE._generic[errorType] ?? TABLE._generic.ungrammatical;
  return text.replace(/\{title\}/g, getPoint(pointId)?.title ?? 'this grammar');
}
